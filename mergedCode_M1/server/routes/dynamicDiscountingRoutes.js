// Clarity - Dynamic Discounting API (Module 2 - ameet faisal)
//
// Buyer-funded early payment flow:
//   GET  /api/dynamic-discounting/eligible-invoices
//   GET  /api/dynamic-discounting/offers
//   POST /api/dynamic-discounting/offers
//   PATCH /api/dynamic-discounting/offers/:id/accept
//   PATCH /api/dynamic-discounting/offers/:id/decline

const express = require('express');
const router = express.Router();
const pool = require('../db');

const BUYER_CONFIRMED_STATUSES = ['Buyer Confirmed', 'Confirmed'];
const DEFAULT_PLATFORM_FEE_RATE = 0.005; // reduced 0.5% facilitation fee

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function calculateOffer(amount, discountRate, platformFeeRate) {
  const invoiceAmount = money(amount);
  const discountAmount = money(invoiceAmount * discountRate);
  const supplierPayout = money(invoiceAmount - discountAmount);
  const platformFee = money(invoiceAmount * platformFeeRate);
  const buyerReturn = money(discountAmount - platformFee);

  return {
    invoiceAmount,
    discountAmount,
    supplierPayout,
    platformFee,
    buyerReturn,
  };
}

function validateRate(rate, label, min, max) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min * 100}% and ${max * 100}%.`);
  }
  return value;
}

const OFFER_SELECT = `
  SELECT
    o.id,
    o.invoice_id,
    o.buyer_name,
    o.discount_rate,
    o.platform_fee_rate,
    o.invoice_amount,
    o.discount_amount,
    o.supplier_payout,
    o.platform_fee,
    o.buyer_return,
    o.status,
    TO_CHAR(o.offered_at, 'YYYY-MM-DD') AS offered_at,
    TO_CHAR(o.responded_at, 'YYYY-MM-DD') AS responded_at,
    TO_CHAR(o.settled_at, 'YYYY-MM-DD') AS settled_at,
    i.invoice_number,
    i.supplier_id,
    TO_CHAR(i.due_date, 'YYYY-MM-DD') AS due_date,
    i.status AS invoice_status
  FROM dynamic_discount_offers o
  JOIN invoices i ON i.id::TEXT = o.invoice_id
`;

router.get('/eligible-invoices', async (req, res) => {
  try {
    const buyerName = req.query.buyerName || null;

    const params = [...BUYER_CONFIRMED_STATUSES];
    let buyerFilter = '';
    if (buyerName) {
      params.push(buyerName);
      buyerFilter = `AND i.buyer_name = $${params.length}`;
    }

    const result = await pool.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.buyer_name,
          i.supplier_id,
          i.invoice_amount,
          i.status,
          TO_CHAR(i.due_date, 'YYYY-MM-DD') AS due_date,
          GREATEST((i.due_date::DATE - CURRENT_DATE), 0) AS days_until_due
        FROM invoices i
        WHERE i.status = ANY($1::TEXT[])
          AND NOT EXISTS (
            SELECT 1
            FROM dynamic_discount_offers o
            WHERE o.invoice_id = i.id::TEXT
              AND o.status IN ('Offered', 'Accepted', 'Settled')
          )
          ${buyerFilter}
        ORDER BY i.due_date ASC NULLS LAST, i.id DESC
      `,
      [BUYER_CONFIRMED_STATUSES, ...params.slice(BUYER_CONFIRMED_STATUSES.length)]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Dynamic discount eligible invoices error:', error);
    res.status(500).json({ message: 'Could not load eligible invoices' });
  }
});

router.get('/offers', async (req, res) => {
  try {
    const filters = [];
    const params = [];

    if (req.query.supplierId) {
      params.push(String(req.query.supplierId));
      filters.push(`i.supplier_id = $${params.length}`);
    }

    if (req.query.status) {
      params.push(String(req.query.status));
      filters.push(`o.status = $${params.length}`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(
      `
        ${OFFER_SELECT}
        ${whereClause}
        ORDER BY o.offered_at DESC, o.id DESC
      `,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Dynamic discount offers error:', error);
    res.status(500).json({ message: 'Could not load discount offers' });
  }
});

router.post('/offers', async (req, res) => {
  const client = await pool.connect();

  try {
    const invoiceIds = Array.isArray(req.body.invoiceIds) ? req.body.invoiceIds : [];
    const buyerName = String(req.body.buyerName || '').trim();
    const discountRate = validateRate(req.body.discountRate, 'Discount rate', 0.001, 0.20);
    const platformFeeRate = validateRate(
      req.body.platformFeeRate || DEFAULT_PLATFORM_FEE_RATE,
      'Platform fee rate',
      0,
      0.05
    );

    if (!buyerName) {
      return res.status(400).json({ message: 'Buyer name is required.' });
    }
    if (invoiceIds.length === 0) {
      return res.status(400).json({ message: 'Select at least one invoice.' });
    }

    await client.query('BEGIN');

    const created = [];
    for (const invoiceId of invoiceIds) {
      const invoiceKey = String(invoiceId);
      const invoiceResult = await client.query(
        `
          SELECT id, buyer_name, invoice_amount, status
          FROM invoices
          WHERE id::TEXT = $1
            AND status = ANY($2::TEXT[])
          FOR UPDATE
        `,
        [invoiceKey, BUYER_CONFIRMED_STATUSES]
      );

      if (invoiceResult.rowCount === 0) {
        throw new Error(`Invoice ${invoiceId} is not eligible for buyer-funded discounting.`);
      }

      const invoice = invoiceResult.rows[0];
      const openOffer = await client.query(
        `
          SELECT id
          FROM dynamic_discount_offers
          WHERE invoice_id = $1
            AND status IN ('Offered', 'Accepted', 'Settled')
          LIMIT 1
        `,
        [invoiceKey]
      );

      if (openOffer.rowCount > 0) {
        throw new Error(`Invoice ${invoiceId} already has an active discount offer.`);
      }

      const calculated = calculateOffer(invoice.invoice_amount, discountRate, platformFeeRate);
      const offerResult = await client.query(
        `
          INSERT INTO dynamic_discount_offers
            (invoice_id, buyer_name, discount_rate, platform_fee_rate,
             invoice_amount, discount_amount, supplier_payout,
             platform_fee, buyer_return, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Offered')
          RETURNING *
        `,
        [
          invoiceKey,
          buyerName || invoice.buyer_name,
          discountRate,
          platformFeeRate,
          calculated.invoiceAmount,
          calculated.discountAmount,
          calculated.supplierPayout,
          calculated.platformFee,
          calculated.buyerReturn,
        ]
      );

      created.push(offerResult.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ offers: created });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Dynamic discount create offer error:', error);
    res.status(400).json({ message: error.message || 'Could not create discount offer' });
  } finally {
    client.release();
  }
});

router.patch('/offers/:id/accept', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const offerResult = await client.query(
      `
        SELECT *
        FROM dynamic_discount_offers
        WHERE id = $1
        FOR UPDATE
      `,
      [req.params.id]
    );

    if (offerResult.rowCount === 0) {
      throw new Error('Discount offer was not found.');
    }

    const offer = offerResult.rows[0];
    if (offer.status !== 'Offered') {
      throw new Error('Only open offers can be accepted.');
    }

    await client.query(
      `
        UPDATE invoices
        SET status = 'Payout Initiated',
            current_stage = 'Payout Initiated',
            payout_amount = $1,
            payment_date = CURRENT_DATE,
            funder_id = NULL
        WHERE id::TEXT = $2
      `,
      [offer.supplier_payout, offer.invoice_id]
    );

    await client.query(
      `
        INSERT INTO invoice_history (invoice_id, stage, actor)
        VALUES ($1, 'Payout Initiated', $2)
      `,
      [offer.invoice_id, req.body.actorName || 'Supplier']
    );

    const updatedOffer = await client.query(
      `
        UPDATE dynamic_discount_offers
        SET status = 'Accepted',
            responded_at = NOW(),
            settled_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [offer.id]
    );

    await client.query('COMMIT');
    res.json(updatedOffer.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Dynamic discount accept error:', error);
    res.status(400).json({ message: error.message || 'Could not accept discount offer' });
  } finally {
    client.release();
  }
});

router.patch('/offers/:id/decline', async (req, res) => {
  try {
    const result = await pool.query(
      `
        UPDATE dynamic_discount_offers
        SET status = 'Declined',
            responded_at = NOW()
        WHERE id = $1
          AND status = 'Offered'
        RETURNING *
      `,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ message: 'Only open offers can be declined.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Dynamic discount decline error:', error);
    res.status(500).json({ message: 'Could not decline discount offer' });
  }
});

module.exports = router;

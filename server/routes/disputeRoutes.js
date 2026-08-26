// Feature 02 - Dispute Filing & Invoice Freeze   (Apurba Roy, SL 3)
// Mounted at /api/disputes

const express = require('express');
const pool = require('../db');
const { reconcileInvoice } = require('../services/calendarSync');

const router = express.Router();

// Writes one line into the dispute's history. Nothing here is ever updated
// or deleted, so how a dispute was handled cannot be rewritten later.
function logEvent(client, disputeId, event, actor, detail) {
  return client.query(
    'INSERT INTO dispute_events (dispute_id, event, actor, detail) VALUES ($1, $2, $3, $4)',
    [disputeId, event, actor, detail || null]
  );
}

// 6. POST /api/disputes - file a dispute and freeze the invoice.
//    Both must happen together or neither, so this runs in a transaction.
router.post('/', async (req, res) => {
  const { invoice_id, filed_by, reason, notes } = req.body;

  if (!invoice_id || !filed_by || !reason) {
    return res.status(400).json({ message: 'invoice_id, filed_by and reason are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE locks this invoice row until we commit. A second person
    // clicking "dispute" at the same moment has to wait, then sees it is
    // already frozen - so an invoice can never be frozen twice.
    const invoice = await client.query(
      'SELECT id, frozen_at FROM invoices WHERE id::TEXT = $1 FOR UPDATE',
      [invoice_id]
    );

    if (invoice.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No invoice with that id' });
    }
    if (invoice.rows[0].frozen_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'That invoice is already frozen by an open dispute' });
    }

    const dispute = await client.query(
      `INSERT INTO disputes (invoice_id, filed_by, reason, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [invoice_id, filed_by, reason, notes || null]
    );

    // Freezing is what removes the invoice from the funder marketplace.
    await client.query('UPDATE invoices SET frozen_at = NOW() WHERE id::TEXT = $1', [invoice_id]);

    await logEvent(client, dispute.rows[0].id, 'Dispute filed', filed_by, reason);
    await client.query('COMMIT');
    reconcileInvoice(invoice_id).catch((error) => console.error('Calendar dispute sync failed:', error.message));

    res.status(201).json(dispute.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Could not file the dispute' });
  } finally {
    client.release();
  }
});

// 7. GET /api/disputes - the admin queue. ?status=Open to filter.
router.get('/', async (req, res) => {
  try {
    const status = req.query.status;
    let query = `SELECT * FROM disputes WHERE ($1::TEXT IS NULL OR status = $1)`;
    const params = [status || null];

    if (req.user.role === 'buyer') {
      query += ` AND filed_by = $2`;
      params.push(req.user.business_name);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not load disputes' });
  }
});

// 8. GET /api/disputes/invoice/:invoiceId - is this invoice frozen?
//    The funding engine calls this before letting anyone fund an invoice.
//    NOTE: this must be declared before /:id, otherwise Express would treat
//    the word "invoice" as an id and never reach it.
router.get('/invoice/:invoiceId', async (req, res) => {
  try {
    const invoice = await pool.query(
      'SELECT frozen_at FROM invoices WHERE id::TEXT = $1',
      [req.params.invoiceId]
    );
    if (invoice.rowCount === 0) {
      return res.status(404).json({ message: 'No invoice with that id' });
    }
    const open = await pool.query(
      "SELECT * FROM disputes WHERE invoice_id = $1 AND status = 'Open'",
      [req.params.invoiceId]
    );
    res.json({
      invoice_id: req.params.invoiceId,
      frozen: invoice.rows[0].frozen_at !== null,
      frozen_at: invoice.rows[0].frozen_at,
      open_dispute: open.rows[0] || null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not check that invoice' });
  }
});

// 9. GET /api/disputes/:id - one dispute with its documents and history
router.get('/:id', async (req, res) => {
  try {
    const dispute = await pool.query('SELECT * FROM disputes WHERE id = $1', [req.params.id]);
    if (dispute.rowCount === 0) {
      return res.status(404).json({ message: 'No dispute with that id' });
    }
    const evidence = await pool.query(
      'SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY id',
      [req.params.id]
    );
    const events = await pool.query(
      'SELECT * FROM dispute_events WHERE dispute_id = $1 ORDER BY id',
      [req.params.id]
    );
    res.json({ ...dispute.rows[0], evidence: evidence.rows, events: events.rows });
  } catch (error) {
    res.status(500).json({ message: 'Could not load that dispute' });
  }
});

// 10. POST /api/disputes/:id/evidence - attach a supporting document.
//     The file itself is uploaded to Cloudinary by SL 1's feature; we only
//     keep the link it gives back.
router.post('/:id/evidence', async (req, res) => {
  const { uploaded_by, file_url, note } = req.body;

  if (!uploaded_by || !file_url) {
    return res.status(400).json({ message: 'uploaded_by and file_url are required' });
  }

  try {
    const dispute = await pool.query('SELECT status FROM disputes WHERE id = $1', [req.params.id]);
    if (dispute.rowCount === 0) {
      return res.status(404).json({ message: 'No dispute with that id' });
    }
    if (dispute.rows[0].status !== 'Open') {
      return res.status(409).json({ message: 'That dispute is closed, no more documents can be added' });
    }

    const saved = await pool.query(
      `INSERT INTO dispute_evidence (dispute_id, uploaded_by, file_url, note)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, uploaded_by, file_url, note || null]
    );
    await logEvent(pool, req.params.id, 'Evidence added', uploaded_by, file_url);

    res.status(201).json(saved.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Could not add the document' });
  }
});

// 11. PATCH /api/disputes/:id/resolve - the admin decision.
//     "released" puts the invoice back on the marketplace, "voided" kills it.
router.patch('/:id/resolve', async (req, res) => {
  const { decision, resolution_note, actor } = req.body;

  if (decision !== 'released' && decision !== 'voided') {
    return res.status(400).json({ message: 'decision must be "released" or "voided"' });
  }
  if (!actor) {
    return res.status(400).json({ message: 'actor is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dispute = await client.query('SELECT * FROM disputes WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (dispute.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No dispute with that id' });
    }
    if (dispute.rows[0].status !== 'Open') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'That dispute has already been resolved' });
    }

    const newStatus = decision === 'released' ? 'Released' : 'Voided';

    const updated = await client.query(
      `UPDATE disputes
       SET status = $1, resolution_note = $2, resolved_at = NOW()
       WHERE id = $3 RETURNING *`,
      [newStatus, resolution_note || null, req.params.id]
    );

    // Released: unfreeze so it can be funded again.
    // Voided: it stays frozen forever, which is what "voided" means.
    if (decision === 'released') {
      await client.query(
        'UPDATE invoices SET frozen_at = NULL WHERE id::TEXT = $1',
        [dispute.rows[0].invoice_id]
      );
    }

    await logEvent(client, req.params.id, 'Dispute ' + newStatus.toLowerCase(), actor, resolution_note);
    await client.query('COMMIT');
    reconcileInvoice(dispute.rows[0].invoice_id).catch((error) => console.error('Calendar dispute sync failed:', error.message));

    res.json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Could not resolve the dispute' });
  } finally {
    client.release();
  }
});

// 12. DELETE /api/disputes/:id/evidence/:evidenceId - remove a wrong document
router.delete('/:id/evidence/:evidenceId', async (req, res) => {
  try {
    const removed = await pool.query(
      'DELETE FROM dispute_evidence WHERE id = $1 AND dispute_id = $2 RETURNING *',
      [req.params.evidenceId, req.params.id]
    );
    if (removed.rowCount === 0) {
      return res.status(404).json({ message: 'No such document on that dispute' });
    }
    await logEvent(pool, req.params.id, 'Evidence removed', 'system', removed.rows[0].file_url);

    res.json({ deleted: true, evidence: removed.rows[0] });
  } catch (error) {
    res.status(500).json({ message: 'Could not remove the document' });
  }
});

module.exports = router;

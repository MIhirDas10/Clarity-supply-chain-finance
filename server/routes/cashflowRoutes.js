// Clarity - Cash Flow Forecast Engine API (Ameet Faisal - Module 1 / SL 4)
//
// GET /api/cashflow/forecast?supplierId=1
//
// Computes a 30-, 60-, and 90-day forward cash flow forecast for a supplier's account.
// Branches between discounted early-payout amounts and full-term maturity amounts.

const express = require('express');
const router = express.Router();
const pool = require('../db');

const EARLY_DISCOUNT_RATE = 0.03; // Standard 3% early funding discount

router.get('/forecast', async (req, res) => {
  try {
    const supplierId = req.query.supplierId || '1';

    // Fetch active/confirmed invoices expecting future inflow (excluding already completed, disputed, or voided)
    const result = await pool.query(
      `SELECT
        id,
        invoice_number,
        buyer_name,
        invoice_amount,
        payout_amount,
        status,
        TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date,
        TO_CHAR(submitted_date, 'YYYY-MM-DD') AS submitted_date
       FROM invoices
       WHERE (supplier_id = $1 OR supplier_id = '1')
         AND status NOT IN ('Completed', 'Rejected', 'Disputed', 'Frozen')
       ORDER BY due_date ASC NULLS LAST, id DESC`,
      [String(supplierId)]
    );

    const invoices = result.rows;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let summary = {
      total30Days: { early: 0, maturity: 0 },
      total60Days: { early: 0, maturity: 0 },
      total90Days: { early: 0, maturity: 0 },
      totalActiveInvoices: invoices.length,
      totalPortfolioMaturity: 0,
      totalPortfolioEarly: 0,
    };

    const formattedInvoices = [];
    const dailyInflows = {};

    // Initialize 90 days of timeline slots
    for (let d = 0; d <= 90; d++) {
      const dateObj = new Date(today);
      dateObj.setDate(today.getDate() + d);
      const dateStr = dateObj.toISOString().split('T')[0];
      dailyInflows[dateStr] = {
        day: d,
        date: dateStr,
        earlyInflow: 0,
        maturityInflow: 0,
      };
    }

    for (const inv of invoices) {
      const amount = Number(inv.invoice_amount || 0);
      const earlyAmount = inv.payout_amount
        ? Number(inv.payout_amount)
        : Math.round(amount * (1 - EARLY_DISCOUNT_RATE) * 100) / 100;

      // Maturity date calculation
      const dueObj = inv.due_date ? new Date(inv.due_date) : new Date(today.getTime() + 60 * 86400000);
      dueObj.setHours(0, 0, 0, 0);

      const daysToMaturity = Math.max(0, Math.round((dueObj - today) / (1000 * 60 * 60 * 24)));

      // Early payout date: if already funded or payout initiated, immediate (0-3 days), else 3 days from submit or today
      const earlyObj = new Date(today.getTime() + 3 * 86400000); // 3 days early funding turnaround
      const daysToEarly = Math.max(0, Math.round((earlyObj - today) / (1000 * 60 * 60 * 24)));

      // Assign bucket
      let bucket = '90+ Days';
      if (daysToMaturity <= 30) {
        bucket = '0-30 Days';
        summary.total30Days.maturity += amount;
        summary.total30Days.early += earlyAmount;
      } else if (daysToMaturity <= 60) {
        bucket = '31-60 Days';
        summary.total60Days.maturity += amount;
        summary.total60Days.early += earlyAmount;
      } else if (daysToMaturity <= 90) {
        bucket = '61-90 Days';
        summary.total90Days.maturity += amount;
        summary.total90Days.early += earlyAmount;
      }

      summary.totalPortfolioMaturity += amount;
      summary.totalPortfolioEarly += earlyAmount;

      // Record daily inflows for graph mapping
      const dueStr = dueObj.toISOString().split('T')[0];
      const earlyStr = earlyObj.toISOString().split('T')[0];

      if (dailyInflows[dueStr]) {
        dailyInflows[dueStr].maturityInflow += amount;
      }
      if (dailyInflows[earlyStr]) {
        dailyInflows[earlyStr].earlyInflow += earlyAmount;
      }

      formattedInvoices.push({
        id: inv.id,
        invoiceNumber: inv.invoice_number || `INV-${inv.id}`,
        buyerName: inv.buyer_name || 'Corporate Buyer',
        status: inv.status || 'Active',
        dueDate: inv.due_date,
        submittedDate: inv.submitted_date,
        daysToMaturity,
        daysToEarly,
        fullMaturityAmount: amount,
        discountedEarlyAmount: earlyAmount,
        discountSavingsCost: Math.round((amount - earlyAmount) * 100) / 100,
        bucket,
      });
    }

    // Build timeline curves with cumulative totals
    const timeline = [];
    let cumEarly = 0;
    let cumMaturity = 0;

    const sortedDates = Object.keys(dailyInflows).sort();
    for (const dStr of sortedDates) {
      const entry = dailyInflows[dStr];
      cumEarly += entry.earlyInflow;
      cumMaturity += entry.maturityInflow;

      timeline.push({
        day: entry.day,
        date: entry.date,
        earlyInflow: entry.earlyInflow,
        maturityInflow: entry.maturityInflow,
        cumulativeEarly: cumEarly,
        cumulativeMaturity: cumMaturity,
      });
    }

    res.json({
      summary,
      timeline,
      invoices: formattedInvoices,
    });
  } catch (error) {
    console.error('Cash Flow Forecast Error:', error);
    res.status(500).json({ message: 'Could not generate cash flow forecast' });
  }
});

module.exports = router;

const pool = require("../db");
const { reconcileInvoice } = require("./calendarSync");
const credit = require("../controllers/creditController");
const erp = require("./erpSheets"); // Mihir - ERP / Sheets sync

// A funder is not required to sign up before depositing - the wallet row is
// created the first time we see their id, the same way an invoice's
// supplier_id or a buyer's name is used without a separate signup step
// elsewhere in this codebase.
async function getOrCreateWallet(client, funderId, funderName) {
  await client.query(
    `INSERT INTO funder_wallets (funder_id, funder_name, balance)
     VALUES ($1, $2, 0)
     ON CONFLICT (funder_id) DO NOTHING`,
    [funderId, funderName],
  );
  const result = await client.query(
    "SELECT * FROM funder_wallets WHERE funder_id = $1 FOR UPDATE",
    [funderId],
  );
  return result.rows[0];
}

// Credits a wallet - only ever called once a real bKash payment has been
// executed as Completed. Runs in its own transaction. ref is client_ref,
// kept from when this feature used a different gateway whose own charge id
// changed between creation and completion (see walletRoutes.js) - bKash's
// own paymentID doesn't have that problem, but client_ref is still what
// wallet_transactions is keyed on here.
async function creditWallet(funderId, funderName, amount, ref) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const wallet = await getOrCreateWallet(client, funderId, funderName);
    const newBalance = Number(wallet.balance) + Number(amount);

    await client.query(
      "UPDATE funder_wallets SET balance = $2, updated_at = NOW() WHERE funder_id = $1",
      [funderId, newBalance],
    );
    await client.query(
      `UPDATE wallet_transactions
       SET status = 'Completed', balance_after = $2, completed_at = NOW()
       WHERE client_ref = $1`,
      [ref, newBalance],
    );

    await client.query("COMMIT");
    return newBalance;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// The shared fund-an-invoice-from-a-wallet transaction. Locks the invoice,
// checks it is still fundable, checks the wallet can afford it, then debits
// the wallet and advances the invoice in the same all-or-nothing transaction
// Digonta's manual funding uses (same status/current_stage/funder_id/
// funded_at writes, same invoice_history row), so both paths leave the
// pipeline in a state Mihir's dashboard already knows how to read.
async function fundInvoiceFromWallet(invoiceId, funderId, funderName, source) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoiceRes = await client.query(
      "SELECT * FROM invoices WHERE id = $1 FOR UPDATE",
      [invoiceId],
    );
    if (invoiceRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, status: 404, reason: "Invoice not found" };
    }

    const invoice = invoiceRes.rows[0];
    if (invoice.status !== "Buyer Confirmed" || invoice.funder_id !== null) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 409,
        reason: "Invoice is no longer available to fund",
      };
    }
    // frozen_at is set the moment a dispute is filed (Feature 2) - the whole
    // point of the freeze is that no money moves on this invoice until the
    // dispute is resolved, so wallet funding has to honour it too.
    if (invoice.frozen_at !== null) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 409,
        reason: "Invoice is frozen due to an open dispute",
      };
    }

    const wallet = await getOrCreateWallet(client, funderId, funderName);
    const faceValue = Number(invoice.invoice_amount);

    // Credit-limit control: the buyer's credit score / manual override / set
    // limit is enforced here (against the face value the buyer owes), so
    // funding that would breach the limit is rejected. Read inside this same
    // transaction (row lock held) for a consistent exposure total. This is what
    // makes the Buyer Credit page a real control rather than just a display.
    const limitCheck = await credit.checkCreditLimit(
      client,
      invoice.buyer_name,
      faceValue,
    );
    if (!limitCheck.ok) {
      await client.query("ROLLBACK");
      return { ok: false, status: 409, reason: limitCheck.reason };
    }

    // Risk-based pricing, applied for real: the funder deploys the discounted
    // `payout` to the supplier now; the discount (face - payout) is the funder's
    // return, collected at settlement (Ameet's engine already reads
    // payout_amount as the deployed principal). A weaker credit score widens the
    // discount, so the price genuinely reflects the buyer's risk.
    const tenorDays = credit.tenorDaysUntil(invoice.due_date);
    const quote = await credit.quoteForBuyer(
      invoice.buyer_name,
      faceValue,
      tenorDays,
    );
    const payout =
      quote.supplierPayout > 0 && quote.supplierPayout <= faceValue
        ? quote.supplierPayout
        : faceValue;

    if (Number(wallet.balance) < payout) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 409,
        reason: "Wallet balance is too low for this invoice",
      };
    }

    const newBalance = Number(wallet.balance) - payout;
    await client.query(
      "UPDATE funder_wallets SET balance = $2, updated_at = NOW() WHERE funder_id = $1",
      [funderId, newBalance],
    );
    await client.query(
      `INSERT INTO wallet_transactions (funder_id, type, amount, balance_after, invoice_id, status, completed_at)
       VALUES ($1, 'Invoice Funding', $2, $3, $4, 'Completed', NOW())`,
      [funderId, -payout, newBalance, invoiceId],
    );

    await client.query(
      `UPDATE invoices
       SET status = 'Funded', current_stage = 'Funded', funder_id = $2, funded_at = NOW(),
           payout_amount = $3, updated_at = NOW()
       WHERE id = $1`,
      [invoiceId, funderId, payout],
    );
    await client.query(
      `INSERT INTO invoice_history (invoice_id, stage, actor) VALUES ($1, 'Funded', $2)`,
      [
        invoiceId,
        source === "auto-invest" ? `${funderName} (Auto-Invest)` : funderName,
      ],
    );

    await client.query("COMMIT");
    reconcileInvoice(invoiceId).catch((error) =>
      console.error("Calendar funding sync failed:", error.message),
    );
    erp.syncInvoiceToSheet(invoiceId).catch((e) =>
      console.error("ERP funding sync failed:", e.message),
    );
    return {
      ok: true,
      invoiceId,
      funderId,
      amount: payout, // capital deployed to the supplier
      faceValue, // collected from the buyer at settlement
      discount: Math.round((faceValue - payout) * 100) / 100,
      discountRate: quote.discountRate, // % of face, at this buyer's risk
      creditScore: quote.score,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getOrCreateWallet, creditWallet, fundInvoiceFromWallet };

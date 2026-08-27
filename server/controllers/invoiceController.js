const pool = require('../db');
const smsService = require('../services/smsService');
const healthController = require('./healthController');
const { supplierIdsForAccount } = require('../services/accountScope');

async function accountClause(req, nextIndex = 1) {
    if (req.user.role === 'admin') {
        return { clause: '', values: [] };
    }

    if (req.user.role === 'supplier') {
        const supplierIds = await supplierIdsForAccount(req.user);
        return { clause: `supplier_id = ANY($${nextIndex}::text[])`, values: [supplierIds] };
    }

    if (req.user.role === 'buyer') {
        return { clause: `buyer_name = $${nextIndex}`, values: [req.user.business_name] };
    }

    return { clause: 'FALSE', values: [] };
}

function invoiceSelect() {
    return `
        SELECT
            id::text AS id,
            COALESCE(number, invoice_number, 'INV-' || id::text) AS number,
            buyer_name AS "buyerName",
            COALESCE(
                invoice_amount,
                NULLIF(REGEXP_REPLACE(COALESCE(amount, ''), '[^0-9.]', '', 'g'), '')::numeric
            ) AS amount,
            TO_CHAR(due_date, 'YYYY-MM-DD') AS "dueDate",
            COALESCE(status, current_stage, 'Submitted') AS "currentStage"
        FROM invoices
    `;
}

async function loadHistory(invoiceIds) {
    if (invoiceIds.length === 0) return {};

    const result = await pool.query(
        `SELECT invoice_id::text AS invoice_id, stage, actor, timestamp
         FROM invoice_history
         WHERE invoice_id::text = ANY($1::text[])
         ORDER BY timestamp ASC`,
        [invoiceIds]
    );

    const grouped = {};
    result.rows.forEach((row) => {
        if (!grouped[row.invoice_id]) grouped[row.invoice_id] = [];
        grouped[row.invoice_id].push({
            stage: row.stage,
            actor: row.actor,
            timestamp: row.timestamp,
        });
    });
    return grouped;
}

function mapInvoices(rows, historyByInvoice) {
    return rows.map((row) => ({
        id: row.id,
        number: row.number,
        buyerName: row.buyerName,
        amount: row.amount,
        dueDate: row.dueDate,
        currentStage: row.currentStage,
        history: historyByInvoice[row.id] || [],
    }));
}

exports.getAllInvoices = async (req, res) => {
    try {
        const scope = await accountClause(req);
        const where = scope.clause ? `WHERE ${scope.clause}` : '';
        const result = await pool.query(
            `${invoiceSelect()}
             ${where}
             ORDER BY created_at DESC NULLS LAST, submitted_date DESC NULLS LAST, id::text DESC`,
            scope.values
        );

        const invoiceIds = result.rows.map((row) => row.id);
        const historyByInvoice = await loadHistory(invoiceIds);
        res.status(200).json(mapInvoices(result.rows, historyByInvoice));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getInvoiceStatus = async (req, res) => {
    try {
        const scope = await accountClause(req, 2);
        const where = `WHERE id::text = $1${scope.clause ? ` AND ${scope.clause}` : ''}`;
        const result = await pool.query(`${invoiceSelect()} ${where}`, [req.params.id, ...scope.values]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Invoice not found for this account' });
        }

        const historyByInvoice = await loadHistory([result.rows[0].id]);
        res.status(200).json(mapInvoices(result.rows, historyByInvoice)[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateInvoiceStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { newStatus, actorName, supplierPhone } = req.body;

        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can manually advance pipeline stages' });
        }

        if (!newStatus) {
            return res.status(400).json({ error: 'newStatus is required' });
        }

        const scope = await accountClause(req, 4);
        const where = `id::text = $3${scope.clause ? ` AND ${scope.clause}` : ''}`;
        const updated = await pool.query(
            `UPDATE invoices
             SET current_stage = $1, status = $2
             WHERE ${where}
             RETURNING id::text AS id`,
            [newStatus, newStatus, id, ...scope.values]
        );

        if (updated.rowCount === 0) {
            return res.status(404).json({ error: 'Invoice not found for this account' });
        }

        await pool.query(
            'INSERT INTO invoice_history (invoice_id, stage, actor) VALUES ($1, $2, $3)',
            [updated.rows[0].id, newStatus, actorName || req.user.business_name || 'System']
        );

        await smsService.sendStatusUpdateSMS(supplierPhone, newStatus);
        await healthController.runRecalculation();

        res.status(200).json({ message: `Invoice ${id} status updated to ${newStatus}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createInvoice = async (req, res) => {
    try {
        const { number, buyerName, amount, dueDate, actorName } = req.body;
        const supplierIds = await supplierIdsForAccount(req.user);
        const supplierId = req.user.role === 'supplier' ? supplierIds[0] || String(req.user.id) : null;
        const saved = await pool.query(
            `INSERT INTO invoices
                (supplier_id, buyer_name, invoice_number, invoice_amount,
                 due_date, submitted_date, status, current_stage, number, amount)
             VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'Submitted', 'Submitted', $3, $6)
             RETURNING id::text AS id, number, buyer_name AS "buyerName",
                       invoice_amount AS amount, TO_CHAR(due_date, 'YYYY-MM-DD') AS "dueDate",
                       status AS "currentStage"`,
            [
                supplierId,
                buyerName,
                number,
                Number(amount) || 0,
                dueDate || null,
                String(amount || ''),
            ]
        );

        await pool.query(
            'INSERT INTO invoice_history (invoice_id, stage, actor) VALUES ($1, $2, $3)',
            [saved.rows[0].id, 'Submitted', actorName || req.user.business_name || 'Supplier']
        );

        await healthController.runRecalculation();

        res.status(201).json({ ...saved.rows[0], history: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

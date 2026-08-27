const pool = require('../db');
const { notificationRecipients, supplierIdsForAccount } = require('../services/accountScope');

async function notificationFilter(req, nextIndex = 1) {
    const requestedRecipient = req.query.recipient;

    if (req.user.role === 'admin') {
        return requestedRecipient
            ? { sql: `n.recipient = $${nextIndex}`, values: [requestedRecipient] }
            : { sql: '', values: [] };
    }

    const recipients = notificationRecipients(req.user);

    if (requestedRecipient && !recipients.includes(requestedRecipient)) {
        return { sql: 'FALSE', values: [] };
    }

    const values = [requestedRecipient ? [requestedRecipient] : recipients];
    const checks = [`n.recipient = ANY($${nextIndex}::text[])`];

    if (!requestedRecipient && req.user.role === 'supplier') {
        const supplierIds = await supplierIdsForAccount(req.user);
        values.push(supplierIds);
        checks.push(`
            EXISTS (
                SELECT 1
                FROM invoices i
                WHERE i.supplier_id = ANY($${nextIndex + 1}::text[])
                  AND n.invoice_link LIKE '%' || i.id::text || '%'
            )
        `);
    }

    return { sql: `(${checks.join(' OR ')})`, values };
}

// GET /api/notifications
// Return notifications for the logged-in account, newest first.
exports.getNotifications = async (req, res) => {
    try {
        const filter = await notificationFilter(req);
        const where = filter.sql ? `WHERE ${filter.sql}` : '';
        const result = await pool.query(
            `SELECT id, recipient, message, invoice_link, type, is_read, created_at
             FROM notifications n
             ${where}
             ORDER BY created_at DESC NULLS LAST, id DESC`,
            filter.values
        );

        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PATCH /api/notifications/:id/read
// Mark one notification as read, only when it belongs to this account.
exports.markAsRead = async (req, res) => {
    try {
        const filter = await notificationFilter(req, 2);
        const accountCheck = filter.sql ? `AND ${filter.sql}` : '';
        const result = await pool.query(
            `UPDATE notifications n
             SET is_read = true
             WHERE n.id = $1 ${accountCheck}
             RETURNING id, recipient, message, invoice_link, type, is_read, created_at`,
            [req.params.id, ...filter.values]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Notification not found for this account' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

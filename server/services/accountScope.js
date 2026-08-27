const pool = require('../db');

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function notificationRecipients(user) {
  const recipients = [user.email, user.business_name];

  if (user.role === 'funder' && user.id) {
    recipients.push(String(user.id), `F-${user.id}`);
  }

  return unique(recipients);
}

async function supplierIdsForAccount(user) {
  if (user?.role !== 'supplier') return [];

  if (user?.business_name) {
    const linked = await pool.query(
      'SELECT id::text AS id FROM suppliers WHERE LOWER(name) = LOWER($1)',
      [user.business_name]
    );
    if (linked.rowCount > 0) {
      return unique(linked.rows.map((row) => row.id));
    }
  }

  return user.id ? [String(user.id)] : [];
}

module.exports = {
  notificationRecipients,
  supplierIdsForAccount,
};

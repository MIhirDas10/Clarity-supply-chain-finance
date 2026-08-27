const ACTIVE_STATUSES = ['Payable', 'Funded', 'Pending', 'Overdue'];
const VALID_STATUSES = new Set([...ACTIVE_STATUSES, 'Paid', 'Disputed', 'Voided']);
const ACCOUNTING_FIELDS = ['note', 'po_number', 'gl_code', 'department', 'payment_terms', 'tax_amount'];
const MANUAL_FIELDS = ['invoice_number', 'supplier_name', 'amount', 'due_date', 'erp_status', ...ACCOUNTING_FIELDS];

const clean = (value) => (value == null ? '' : String(value).trim());
const optional = (value) => clean(value) || null;
const normalize = (value) => clean(value).toLowerCase();
const invoiceKey = (value) => normalize(value).replace(/\s+/g, '');
const checkedAt = () => new Date().toISOString();

function money(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeName(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(ltd|limited|co|company|bd)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameMoney(left, right) {
  if (left == null && right == null) return true;
  return Math.abs((Number(left) || 0) - (Number(right) || 0)) < 0.01;
}

function issueCounts(issues) {
  return {
    missing: issues.filter((issue) => issue.type === 'missing_in_sheet').length,
    mismatched: issues.filter((issue) => issue.type === 'mismatch').length,
    extra: issues.filter((issue) => issue.type === 'extra_in_sheet').length,
  };
}

module.exports = {
  ACCOUNTING_FIELDS,
  ACTIVE_STATUSES,
  MANUAL_FIELDS,
  VALID_STATUSES,
  checkedAt,
  clean,
  dateOnly,
  invoiceKey,
  issueCounts,
  money,
  normalize,
  normalizeName,
  optional,
  sameMoney,
};

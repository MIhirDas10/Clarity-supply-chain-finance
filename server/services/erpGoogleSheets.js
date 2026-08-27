const crypto = require('crypto');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const pool = require('../db');
const { clean, money: numberOrNull } = require('./erpUtils');

const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

const PAYABLE_HEADER = [
  'Invoice #', 'Supplier', 'Amount', 'Early Payout', 'Tax/VAT', 'Due Date',
  'Status', 'PO #', 'GL/Category', 'Department', 'Terms', 'Note', 'Last Updated',
];
const SUPPLIER_HEADER = ['Supplier', 'Supplier ID', 'Contact', 'Status', 'Last Updated'];
const SYNC_LOG_HEADER = ['Time', 'Invoice #', 'Action', 'Status', 'Target', 'Result', 'Detail'];
const STATUS_NAMES = new Set(['Payable', 'Funded', 'Paid', 'Disputed', 'Pending', 'Voided', 'Overdue']);

function configured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function oauthState() {
  return crypto.randomBytes(24).toString('hex');
}

function columnName(index) {
  let name = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function sheetRange(title, a1) {
  const safeTitle = String(title || 'Sheet1').replace(/'/g, "''");
  return encodeURIComponent(`'${safeTitle}'!${a1}`);
}

function spreadsheetUrl(spreadsheetId) {
  return spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null;
}

function googleRequest(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = {};
        try { json = data ? JSON.parse(data) : {}; } catch (_) {}
        if (res.statusCode >= 400) return reject(new Error(json.error?.message || `Google Sheets returned ${res.statusCode}`));
        resolve(json);
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function tokenRequest(form) {
  return new Promise((resolve, reject) => {
    const body = form.toString();
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => (res.statusCode >= 400 ? reject(new Error(`Google token refresh failed: ${data}`)) : resolve(JSON.parse(data))));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function accessToken(conn) {
  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (conn.access_token && expiresAt > Date.now() + 60000) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token;

  const token = await tokenRequest(new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: conn.refresh_token,
    grant_type: 'refresh_token',
  }));

  await pool.query(
    "UPDATE erp_connections SET access_token=$1, expires_at=NOW() + ($2 || ' seconds')::INTERVAL, updated_at=NOW() WHERE id=$3",
    [token.access_token, token.expires_in || 3600, conn.id],
  );
  return token.access_token;
}

async function sheetValues(conn, title, a1, token) {
  const data = await googleRequest('GET', `${SHEETS_BASE}/${conn.spreadsheet_id}/values/${sheetRange(title, a1)}`, null, token);
  return data.values || [];
}

async function writeValues(conn, title, a1, rows, token) {
  await googleRequest(
    'PUT',
    `${SHEETS_BASE}/${conn.spreadsheet_id}/values/${sheetRange(title, a1)}?valueInputOption=USER_ENTERED`,
    { values: rows },
    token,
  );
}

async function appendRow(conn, title, row, token) {
  const result = await googleRequest(
    'POST',
    `${SHEETS_BASE}/${conn.spreadsheet_id}/values/${sheetRange(title, 'A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values: [row] },
    token,
  );
  const match = (result.updates?.updatedRange || '').match(/![A-Z]+(\d+)/i);
  return match ? Number(match[1]) : null;
}

async function sheetId(conn, title, token) {
  const data = await googleRequest('GET', `${SHEETS_BASE}/${conn.spreadsheet_id}?fields=sheets.properties`, null, token);
  const sheet = (data.sheets || []).find((item) => item.properties?.title === title);
  return sheet?.properties?.sheetId ?? null;
}

async function ensureSheet(conn, title, header, token) {
  let id = await sheetId(conn, title, token);
  if (id == null) {
    const added = await googleRequest('POST', `${SHEETS_BASE}/${conn.spreadsheet_id}:batchUpdate`, {
      requests: [{ addSheet: { properties: { title } } }],
    }, token);
    id = added.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
  }

  const endColumn = columnName(header.length);
  const current = (await sheetValues(conn, title, `A1:${endColumn}1`, token))[0] || [];
  if (header.some((cell, index) => clean(current[index]) !== cell)) {
    await writeValues(conn, title, `A1:${endColumn}1`, [header], token);
  }

  if (id != null) {
    try {
      await googleRequest('POST', `${SHEETS_BASE}/${conn.spreadsheet_id}:batchUpdate`, {
        requests: [
          { updateSheetProperties: { properties: { sheetId: id, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
          { autoResizeDimensions: { dimensions: { sheetId: id, dimension: 'COLUMNS', startIndex: 0, endIndex: header.length } } },
        ],
      }, token);
    } catch (_) {}
  }
  return id;
}

function payableRow(fields) {
  return [
    fields.invoice_number || '',
    fields.supplier_name || '',
    fields.amount ?? '',
    fields.payout_amount ?? '',
    fields.tax_amount ?? '',
    fields.due_date || '',
    fields.erp_status || 'Pending',
    fields.po_number || '',
    fields.gl_code || '',
    fields.department || '',
    fields.payment_terms || '',
    fields.note || '',
    new Date().toISOString().slice(0, 16).replace('T', ' '),
  ];
}

async function pushPayable(conn, fields) {
  const token = await accessToken(conn);
  await ensureSheet(conn, conn.ap_sheet, PAYABLE_HEADER, token);

  const invoiceKey = clean(fields.invoice_number).toLowerCase().replace(/\s+/g, '');
  const invoiceColumn = (await sheetValues(conn, conn.ap_sheet, 'A1:A', token)).map((row) => clean(row[0]));
  const index = invoiceColumn.findIndex((value, i) => i > 0 && value.toLowerCase().replace(/\s+/g, '') === invoiceKey);
  const row = payableRow(fields);

  if (index > 0) {
    const rowNumber = index + 1;
    await writeValues(conn, conn.ap_sheet, `A${rowNumber}:${columnName(PAYABLE_HEADER.length)}${rowNumber}`, [row], token);
    return rowNumber;
  }

  return appendRow(conn, conn.ap_sheet, row, token);
}

async function deletePayable(conn, rowNumber) {
  if (!rowNumber || rowNumber <= 1) return false;
  const token = await accessToken(conn);
  const id = await ensureSheet(conn, conn.ap_sheet, PAYABLE_HEADER, token);
  if (id == null) return false;

  await googleRequest('POST', `${SHEETS_BASE}/${conn.spreadsheet_id}:batchUpdate`, {
    requests: [{ deleteDimension: { range: { sheetId: id, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber } } }],
  }, token);
  return true;
}

function parsePayable(row, index) {
  const newLayout = STATUS_NAMES.has(clean(row[6])) || row.length > 7;
  return {
    rowNumber: index + 2,
    invoice_number: clean(row[0]),
    supplier_name: clean(row[1]),
    amount: numberOrNull(row[2]),
    payout_amount: numberOrNull(row[3]),
    tax_amount: newLayout ? numberOrNull(row[4]) : null,
    due_date: newLayout ? clean(row[5]) : clean(row[4]),
    erp_status: newLayout ? clean(row[6]) : clean(row[5]),
  };
}

async function readPayables(conn) {
  const token = await accessToken(conn);
  await ensureSheet(conn, conn.ap_sheet, PAYABLE_HEADER, token);
  const rows = await sheetValues(conn, conn.ap_sheet, `A2:${columnName(PAYABLE_HEADER.length)}`, token);
  return rows.map(parsePayable).filter((row) => row.invoice_number);
}

async function readSuppliers(conn) {
  const token = await accessToken(conn);
  await ensureSheet(conn, conn.supplier_sheet, SUPPLIER_HEADER, token);
  const rows = await sheetValues(conn, conn.supplier_sheet, 'A2:B', token);
  return rows.map((row) => ({ name: clean(row[0]), supplierId: clean(row[1]) })).filter((row) => row.name);
}

async function createTemplate(conn) {
  const token = await accessToken(conn);
  const title = `Clarity AP Ledger - ${conn.business_name || 'Buyer'}`;
  const created = await googleRequest('POST', SHEETS_BASE, {
    properties: { title },
    sheets: [
      { properties: { title: 'Accounts Payable' } },
      { properties: { title: 'Suppliers' } },
      { properties: { title: 'Sync Log' } },
    ],
  }, token);

  const next = {
    ...conn,
    spreadsheet_id: created.spreadsheetId,
    ap_sheet: 'Accounts Payable',
    supplier_sheet: 'Suppliers',
  };

  await ensureSheet(next, 'Accounts Payable', PAYABLE_HEADER, token);
  await ensureSheet(next, 'Suppliers', SUPPLIER_HEADER, token);
  await ensureSheet(next, 'Sync Log', SYNC_LOG_HEADER, token);

  return {
    spreadsheet_id: created.spreadsheetId,
    spreadsheet_url: created.spreadsheetUrl || spreadsheetUrl(created.spreadsheetId),
  };
}

module.exports = {
  GOOGLE_SHEETS_SCOPE,
  PAYABLE_HEADER,
  accessToken,
  configured,
  createTemplate,
  deletePayable,
  googleRequest,
  oauthState,
  pushPayable,
  readPayables,
  readSuppliers,
  spreadsheetUrl,
};

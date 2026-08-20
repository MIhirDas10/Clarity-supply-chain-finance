const crypto = require('crypto');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const pool = require('../db');

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';

function googleRequest(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const request = https.request({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, method, headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        let parsedData = {};
        try { parsedData = data ? JSON.parse(data) : {}; } catch (_) {}
        if (response.statusCode >= 400) return reject(new Error(parsedData.error?.message || `Google Calendar returned ${response.statusCode}`));
        resolve(parsedData);
      });
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function configured() { return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET); }

function calendarDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`Invalid invoice due date: ${value}`);
    return value.toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  const datePart = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (datePart && !Number.isNaN(new Date(`${datePart}T00:00:00Z`).getTime())) return datePart;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid invoice due date: ${value}`);
  return parsed.toISOString().slice(0, 10);
}

function eventPayload(invoice, kind) {
  const date = calendarDate(invoice.due_date);
  const nextDate = new Date(`${date}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const title = kind === 'buyer_due' ? 'Clarity payment due' : 'Clarity expected repayment';
  return { summary: `${title}: ${invoice.invoice_number || invoice.id}`, description: `Invoice ${invoice.invoice_number || invoice.id} for ${invoice.buyer_name || 'Clarity counterparty'}. Managed by Clarity B2B.`, start: { date }, end: { date: nextDate.toISOString().slice(0, 10) }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 7 * 24 * 60 }, { method: 'popup', minutes: 24 * 60 }] } };
}

async function accessToken(connection) {
  if (connection.access_token && connection.expires_at && new Date(connection.expires_at).getTime() > Date.now() + 60000) return connection.access_token;
  if (!connection.refresh_token) return connection.access_token;
  const body = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: connection.refresh_token, grant_type: 'refresh_token' });
  const token = await new Promise((resolve, reject) => {
    const request = https.request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body.toString()) } }, (response) => { let data = ''; response.on('data', (chunk) => { data += chunk; }); response.on('end', () => response.statusCode >= 400 ? reject(new Error(`Google token refresh failed: ${data}`)) : resolve(JSON.parse(data))); });
    request.on('error', reject); request.write(body.toString()); request.end();
  });
  await pool.query("UPDATE calendar_connections SET access_token=$1, expires_at=NOW() + ($2 || ' seconds')::INTERVAL, updated_at=NOW() WHERE id=$3", [token.access_token, token.expires_in || 3600, connection.id]);
  return token.access_token;
}

function shouldHaveEvents(invoice) { return invoice.funder_id && invoice.due_date && !invoice.frozen_at && !['Completed', 'Voided', 'Void', 'Rejected'].includes(invoice.status); }

async function reconcileConnection(connection, invoice) {
  const eventRows = await pool.query('SELECT * FROM calendar_events WHERE connection_id=$1 AND invoice_id=$2', [connection.id, String(invoice.id)]);
  const token = configured() && connection.access_token ? await accessToken(connection) : null;
  const activeKinds = connection.role === 'buyer' ? ['buyer_due'] : connection.role === 'funder' ? ['funder_maturity'] : ['buyer_due', 'funder_maturity'];
  for (const row of eventRows.rows) {
    if (!shouldHaveEvents(invoice) || !activeKinds.includes(row.event_kind)) {
      if (token && row.google_event_id) { try { await googleRequest('DELETE', `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(row.google_event_id)}`, null, token); } catch (error) { if (!error.message.includes('404')) throw error; } }
      await pool.query("UPDATE calendar_events SET status='Cancelled', last_synced_at=NOW() WHERE id=$1", [row.id]);
    }
  }
  if (!shouldHaveEvents(invoice)) return [];
  const saved = [];
  for (const kind of activeKinds) {
    const existing = eventRows.rows.find((row) => row.event_kind === kind);
    const payload = eventPayload(invoice, kind);
    let googleEventId = existing?.google_event_id || null;
    if (token) {
      const googleEvent = googleEventId ? await googleRequest('PATCH', `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`, payload, token) : await googleRequest('POST', 'https://www.googleapis.com/calendar/v3/calendars/primary/events', payload, token);
      googleEventId = googleEvent.id;
    }
    const result = await pool.query(`INSERT INTO calendar_events (connection_id, invoice_id, event_kind, google_event_id, event_date, status, last_synced_at) VALUES ($1,$2,$3,$4,$5,'Active',NOW()) ON CONFLICT (connection_id, invoice_id, event_kind) DO UPDATE SET google_event_id=COALESCE(EXCLUDED.google_event_id, calendar_events.google_event_id), event_date=EXCLUDED.event_date, status='Active', last_synced_at=NOW() RETURNING *`, [connection.id, String(invoice.id), kind, googleEventId, payload.start.date]);
    saved.push(result.rows[0]);
  }
  return saved;
}

async function reconcileInvoice(invoiceId) {
  const invoiceResult = await pool.query('SELECT * FROM invoices WHERE id::TEXT=$1', [String(invoiceId)]);
  if (!invoiceResult.rowCount) return [];
  const invoice = invoiceResult.rows[0];
  const connections = await pool.query(`SELECT c.*, u.role FROM calendar_connections c JOIN users u ON u.id=c.user_id WHERE (u.role='buyer' AND u.business_name=$1) OR (u.role='funder' AND (u.business_name=$2 OR u.id::TEXT=$2 OR CONCAT('F-', u.id)=$2)) OR u.role='admin'`, [invoice.buyer_name, String(invoice.funder_id || '')]);
  const results = [];
  for (const connection of connections.rows) results.push(...await reconcileConnection(connection, invoice));
  return results;
}

function oauthState() { return crypto.randomBytes(24).toString('hex'); }

module.exports = { configured, accessToken, googleRequest, oauthState, reconcileInvoice, GOOGLE_SCOPE };
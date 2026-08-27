// Clarity - Google Calendar Integration (Ameet Faisal - Module 4 / SL 4)
//
// GET /api/calendar/status
//
// Returns the current Google Calendar connection status for the logged-in user, including whether the server is configured with Google credentials and whether the user has an active connection.
//
// GET /api/calendar/connect
//
// Initiates the Google OAuth flow for the logged-in user, returning a URL to redirect the user to Google's authorization page.
//
// GET /api/calendar/oauth/callback
//
// Handles the OAuth callback from Google, exchanging the authorization code for an access token and storing it in the database.
//
// GET /api/calendar/events
//
// Returns a list of calendar events that have been synced for the logged-in user, including invoice details and event status.
//
// POST /api/calendar/sync/:invoiceId
//
// Syncs a specific invoice's due or maturity date to the connected Google Calendar, creating or updating a calendar event as necessary.
//
// DELETE /api/calendar/disconnect
//
// Disconnects the user's Google Calendar connection, removing any stored tokens and revoking access. 
const express = require('express');
const https = require('https');
const pool = require('../db');
const { configured, clientId, clientSecret, oauthState, reconcileInvoice, GOOGLE_SCOPE } = require('../services/calendarSync');

const router = express.Router();

function googleRequest(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = https.request({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, method, headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(body ? { 'Content-Length': Buffer.byteLength(JSON.stringify(body)) } : {})
    }}, (response) => {
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
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

router.get('/status', async (req, res) => {
  const result = await pool.query('SELECT id, provider, scope, expires_at, updated_at FROM calendar_connections WHERE user_id = $1', [req.user.id]);
  res.json({ configured: configured(), connected: result.rowCount > 0, connection: result.rows[0] || null });
});

router.get('/connect', async (req, res) => {
  if (!configured()) return res.status(503).json({ message: 'Google Calendar credentials are not configured on the server' });
  const state = oauthState();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/calendar/oauth/callback`;
  await pool.query(
    `INSERT INTO calendar_connections (user_id, oauth_state) VALUES ($1, $2)
     ON CONFLICT (user_id, provider) DO UPDATE SET oauth_state = EXCLUDED.oauth_state, updated_at = NOW()`,
    [req.user.id, state]
  );
  const params = new URLSearchParams({ client_id: clientId(), redirect_uri: redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: GOOGLE_SCOPE, state });
  res.json({ authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

async function oauthCallback(req, res) {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`Google authorization was cancelled: ${error}`);
  if (!code || !state) return res.status(400).send('Missing Google OAuth code or state');
  const connection = await pool.query('SELECT * FROM calendar_connections WHERE oauth_state = $1', [state]);
  if (!connection.rowCount) return res.status(400).send('Invalid or expired OAuth state');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/calendar/oauth/callback`;
  const tokenBody = new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri, grant_type: 'authorization_code' });
  try {
    const token = await new Promise((resolve, reject) => {
      const request = https.request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody.toString()) } }, (response) => { let data = ''; response.on('data', (chunk) => { data += chunk; }); response.on('end', () => response.statusCode >= 400 ? reject(new Error(data)) : resolve(JSON.parse(data))); });
      request.on('error', reject); request.write(tokenBody.toString()); request.end();
    });
    await pool.query(`UPDATE calendar_connections SET access_token=$1, refresh_token=COALESCE($2, refresh_token), token_type=$3, scope=$4, expires_at=NOW() + ($5 || ' seconds')::INTERVAL, oauth_state=NULL, updated_at=NOW() WHERE id=$6`, [token.access_token, token.refresh_token || null, token.token_type || 'Bearer', token.scope || GOOGLE_SCOPE, token.expires_in || 3600, connection.rows[0].id]);
    const user = await pool.query('SELECT role FROM users WHERE id=$1', [connection.rows[0].user_id]);
    const calendarPath = user.rows[0]?.role === 'buyer' ? '/buyer/calendar' : user.rows[0]?.role === 'funder' ? '/funder/calendar' : '/calendar';
    res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}${calendarPath}?connected=1`);
  } catch (oauthError) { res.status(502).send(`Google token exchange failed: ${oauthError.message}`); }
}

router.get('/oauth/callback', oauthCallback);

router.get('/events', async (req, res) => {
  const result = await pool.query(`SELECT e.id, e.connection_id, e.invoice_id, e.event_kind, e.google_event_id,
    TO_CHAR(e.event_date, 'YYYY-MM-DD') AS event_date, e.status, e.last_synced_at,
    i.invoice_number, i.buyer_name
    FROM calendar_events e JOIN calendar_connections c ON c.id=e.connection_id
    LEFT JOIN invoices i ON i.id::TEXT=e.invoice_id
    WHERE c.user_id=$1 AND e.status='Active' ORDER BY e.event_date`, [req.user.id]);
  res.json(result.rows);
});

router.post('/sync/:invoiceId', async (req, res) => {
  const connection = await pool.query('SELECT * FROM calendar_connections WHERE user_id = $1', [req.user.id]);
  if (!connection.rowCount) return res.status(409).json({ message: 'Connect Google Calendar first' });
  const invoiceResult = await pool.query('SELECT * FROM invoices WHERE id::TEXT = $1', [req.params.invoiceId]);
  if (!invoiceResult.rowCount) return res.status(404).json({ message: 'Invoice not found' });
  const invoice = invoiceResult.rows[0];
  if (!invoice.funder_id || !invoice.due_date) {
    return res.status(409).json({ message: 'Calendar sync requires a funded invoice with a due date.' });
  }
  if (invoice.frozen_at || ['Completed', 'Voided', 'Void', 'Rejected'].includes(invoice.status)) {
    return res.status(409).json({ message: 'This invoice is no longer eligible for active calendar events.' });
  }
  try {
    const saved = await reconcileInvoice(invoice.id);
    res.json({ events: saved, live_google_sync: Boolean(connection.rows[0].access_token) });
  } catch (error) { res.status(502).json({ message: error.message }); }
});

router.delete('/disconnect', async (req, res) => {
  await pool.query('DELETE FROM calendar_connections WHERE user_id = $1', [req.user.id]);
  res.json({ disconnected: true });
});

module.exports = router;
module.exports.oauthCallback = oauthCallback;
module.exports.reconcileInvoice = reconcileInvoice;

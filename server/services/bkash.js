// Wrapper around bKash's real Tokenized Checkout sandbox API - what stands
// in for the FR document's "bKash Merchant API" line.
//
// Every endpoint below (paths, headers, body shape) was confirmed against
// the real sandbox at https://tokenized.sandbox.bka.sh before this file was
// written - the abbreviated docs bKash publishes leave out required fields
// (mode, payerReference, callbackURL) and get some paths wrong, so this was
// worth checking rather than guessing.

const GRANT_URL = process.env.BKASH_GRANT_URL || 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant';
const BASE_URL = process.env.BKASH_BASE_URL || 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout';
const APP_KEY = process.env.BKASH_APP_KEY;
const APP_SECRET = process.env.BKASH_APP_SECRET;
const USERNAME = process.env.BKASH_USERNAME;
const PASSWORD = process.env.BKASH_PASSWORD;

// bKash's id_token expires (sandbox: 1 hour). Cached here so every deposit
// doesn't re-authenticate - refreshed a little early so a token never
// expires mid-request.
let cachedToken = null;
let tokenExpiresAt = 0;

async function grantToken() {
  const response = await fetch(GRANT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'username': USERNAME,
      'password': PASSWORD,
    },
    body: JSON.stringify({ app_key: APP_KEY, app_secret: APP_SECRET }),
  });
  const data = await response.json();
  if (!data.id_token) {
    throw new Error(data.msg || data.message || 'bKash did not return a token');
  }
  return data;
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  const data = await grantToken();
  cachedToken = data.id_token;
  // expires_in is seconds; refresh 5 minutes before it actually expires.
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

// bKash's Authorization header is the raw id_token - no "Bearer " prefix,
// despite token_type saying "Bearer" (confirmed against the sandbox: adding
// the prefix makes every call fail auth).
async function call(path, body) {
  const token = await getToken();
  const response = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': token,
      'X-APP-Key': APP_KEY,
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

// Starts a payment. mode "0011" is bKash's tokenized-checkout mode (as
// opposed to "0001" for a stored-card style flow); payerReference is a
// merchant-defined identifier bKash requires but does not otherwise use -
// our own funder_id is passed since something has to go there.
//
// bkashURL is the page to send the funder to - the tokenized-checkout
// equivalent of a redirect_url. bKash appends ?paymentID=...&status=...&
// signature=... to the callbackURL we give it once the funder finishes
// (or cancels) on that page, so callbackURL should be a plain address with
// no query string of its own already on it.
async function createPayment({ amount, merchantInvoiceNumber, payerReference, callbackURL }) {
  const data = await call('/create', {
    mode: '0011',
    payerReference: payerReference || '1',
    callbackURL,
    amount: String(amount),
    currency: 'BDT',
    intent: 'sale',
    merchantInvoiceNumber,
  });

  if (!data.paymentID || !data.bkashURL) {
    throw new Error(data.statusMessage || data.message || 'bKash did not return a payment link');
  }

  return { paymentID: data.paymentID, bkashURL: data.bkashURL };
}

// Finalises a payment after the funder has authorised it on bKash's own
// page. transactionStatus is 'Completed' only once the funder has actually
// gone through with the payment - calling this before that (or twice) is
// safe, bKash answers with an "Invalid Payment State" style message rather
// than an error.
async function executePayment(paymentID) {
  return call('/execute', { paymentID });
}

// Reads a payment's current status without trying to finalise it. Useful
// for checking abandoned/cancelled deposits without accidentally executing
// a payment that was never meant to be captured.
async function queryPayment(paymentID) {
  return call('/payment/status', { paymentID });
}

module.exports = { createPayment, executePayment, queryPayment };

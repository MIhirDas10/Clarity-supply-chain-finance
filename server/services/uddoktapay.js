// Thin wrapper around UddoktaPay's Checkout API v2.
// UddoktaPay is a Bangladeshi payment aggregator that sits in front of
// bKash/Nagad/Rocket, so a funder can pay by bKash without Clarity needing
// its own bKash merchant agreement - this is what stands in for the FR
// document's "bKash Merchant API" line.
//
// Both request/response shapes below were confirmed against the real
// sandbox at https://sandbox.uddoktapay.com before this file was written.

const BASE_URL = process.env.UDDOKTAPAY_BASE_URL || 'https://sandbox.uddoktapay.com';
const API_KEY = process.env.UDDOKTAPAY_API_KEY;

async function call(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      'RT-UDDOKTAPAY-API-KEY': API_KEY,
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

// Starts a payment. UddoktaPay only returns a payment_url - the invoice id
// used to verify it later is the last part of that url.
async function createCharge({ fullName, email, amount, metadata, redirectUrl, cancelUrl, webhookUrl }) {
  const data = await call('/api/checkout-v2', {
    full_name: fullName,
    email,
    amount: String(amount),
    metadata,
    redirect_url: redirectUrl,
    cancel_url: cancelUrl,
    webhook_url: webhookUrl,
    return_type: 'GET',
  });

  if (!data.status || !data.payment_url) {
    throw new Error(data.message || 'UddoktaPay did not return a payment link');
  }

  return {
    paymentUrl: data.payment_url,
    uddoktapayId: data.payment_url.split('/').pop(),
  };
}

// Confirms whether a charge was actually paid. Called after the funder is
// redirected back, never trusted on its own to say "COMPLETED" -
// walletRoutes.js still checks our own ledger before crediting anything.
async function verifyPayment(uddoktapayId) {
  const data = await call('/api/verify-payment', { invoice_id: uddoktapayId });
  return data; // { status: 'COMPLETED', amount, transaction_id, ... } or { status: 'ERROR', message }
}

module.exports = { createCharge, verifyPayment };

// API configuration and calls for the backend Express server.
// Pipeline endpoints are mounted at /api/pipeline on the unified server.
// A relative path lets Vite's dev proxy forward it to the server (port 5000).
const API_BASE_URL = '/api/pipeline';

export const getInvoices = async () => {
    const response = await fetch(`${API_BASE_URL}/invoices`);
    return response.json();
};

export const updateInvoiceStatus = async (id, newStatus, actorName, recipientEmail, note) => {
    const response = await fetch(`${API_BASE_URL}/invoices/${id}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus, actorName, recipientEmail, note }),
    });

    const data = await response.json();

    // The server sends an { error } message when the update is rejected
    // (for example an invalid stage transition). Turn that into a real error
    // so the screen can show it.
    if (!response.ok) {
        throw new Error(data.error || 'Failed to update the invoice status');
    }

    return data;
};

export const createInvoice = async (invoiceData) => {
    const response = await fetch(`${API_BASE_URL}/invoices`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoiceData),
    });
    return response.json();
};

// ---------------------------------------------------------------------------
// The platform now guards /api behind a JWT (Module 4 auth). Every request must
// carry the logged-in user's token, saved by the auth context under this key.
// ---------------------------------------------------------------------------
export function authHeaders() {
    const token = localStorage.getItem('clarity_token');
    return token ? { Authorization: 'Bearer ' + token } : {};
}

// ---------------------------------------------------------------------------
// Shared JSON helper. Attaches the auth token, and throws with the server's
// { error } message on failure so screens can surface it.
// ---------------------------------------------------------------------------
async function request(url, options = {}) {
    const merged = { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } };
    const response = await fetch(url, merged);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || data.message || 'Request failed');
    }
    return data;
}

function jsonBody(method, body) {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// ---------------------------------------------------------------------------
// Feature 3 - Investor Portfolio & Returns Analytics
// ---------------------------------------------------------------------------
export const getPortfolioSummary = () => request('/api/portfolio/summary');
export const getFunders = () => request('/api/portfolio/funders');
export const getFunderPortfolio = (id) => request('/api/portfolio/funders/' + id);
export const setFunderTarget = (id, targetRate) =>
    request('/api/portfolio/funders/' + id + '/target', jsonBody('PUT', { targetRate }));

export const getPortfolioNotes = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('/api/portfolio/notes' + (qs ? '?' + qs : ''));
};
export const createPortfolioNote = (note) => request('/api/portfolio/notes', jsonBody('POST', note));
export const updatePortfolioNote = (id, patch) => request('/api/portfolio/notes/' + id, jsonBody('PATCH', patch));
export const deletePortfolioNote = (id) => request('/api/portfolio/notes/' + id, { method: 'DELETE' });
// Return Calculator / Deployment Planner (compute from funder inputs)
export const runReturnCalculator = (inputs) => request('/api/portfolio/return-calculator', jsonBody('POST', inputs));

// Portfolio Stress Testing (Feature 3 - Part B): scenarios CRUD + run engine
export const getStressScenarios = (funder) => request('/api/portfolio/stress/scenarios' + (funder ? '?funder=' + encodeURIComponent(funder) : ''));
export const createStressScenario = (s) => request('/api/portfolio/stress/scenarios', jsonBody('POST', s));
export const updateStressScenario = (id, patch) => request('/api/portfolio/stress/scenarios/' + id, jsonBody('PATCH', patch));
export const deleteStressScenario = (id) => request('/api/portfolio/stress/scenarios/' + id, { method: 'DELETE' });
export const runStressTest = (funderId, scenarioId) => request('/api/portfolio/stress/run', jsonBody('POST', { funderId, scenarioId }));
export const getStressRuns = (funder) => request('/api/portfolio/stress/runs' + (funder ? '?funder=' + encodeURIComponent(funder) : ''));

// ---------------------------------------------------------------------------
// Feature 4 - Buyer Credit Scoring Engine
// ---------------------------------------------------------------------------
export const getCreditSummary = () => request('/api/credit/summary');
export const getCreditBuyers = () => request('/api/credit/buyers');
export const getCreditBuyer = (name) => request('/api/credit/buyers/' + encodeURIComponent(name));
export const getCreditHistory = (name) => request('/api/credit/buyers/' + encodeURIComponent(name) + '/history');
export const recalculateCredit = () => request('/api/credit/recalculate', { method: 'POST' });

export const getCreditConfig = () => request('/api/credit/config');
export const updateCreditConfig = (weights) => request('/api/credit/config', jsonBody('PATCH', weights));

export const getCreditNotes = (name) => request('/api/credit/buyers/' + encodeURIComponent(name) + '/notes');
export const addCreditNote = (name, note, author) =>
    request('/api/credit/buyers/' + encodeURIComponent(name) + '/notes', jsonBody('POST', { note, author }));
export const deleteCreditNote = (name, id) =>
    request('/api/credit/buyers/' + encodeURIComponent(name) + '/notes/' + id, { method: 'DELETE' });
export const overrideCreditScore = (name, score, reason) =>
    request('/api/credit/buyers/' + encodeURIComponent(name) + '/override', jsonBody('PATCH', { score, reason }));

// Credit Limit & Exposure Engine
export const getCreditExposure = (name) =>
    request('/api/credit/buyers/' + encodeURIComponent(name) + '/exposure');
export const setCreditLimit = (name, creditLimit) =>
    request('/api/credit/buyers/' + encodeURIComponent(name) + '/limit', jsonBody('PATCH', { creditLimit }));

// Risk-Based Pricing Engine (score -> discount rate)
export const getCreditPricing = (name, amount, tenor) =>
    request('/api/credit/buyers/' + encodeURIComponent(name) + '/pricing?amount=' + amount + '&tenor=' + tenor);
export const getPricingPolicy = () => request('/api/credit/pricing-policy');
export const updatePricingPolicy = (policy) => request('/api/credit/pricing-policy', jsonBody('PATCH', policy));

// API configuration and calls for the backend Express server.
// Pipeline endpoints are mounted at /api/pipeline on the unified server.
// A relative path lets Vite's dev proxy forward it to the server (port 5000).
const API_BASE_URL = '/api/pipeline';

export const getInvoices = async () => {
    const response = await fetch(`${API_BASE_URL}/invoices`);
    return response.json();
};

export const updateInvoiceStatus = async (id, newStatus, actorName, supplierPhone) => {
    const response = await fetch(`${API_BASE_URL}/invoices/${id}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus, actorName, supplierPhone }),
    });
    return response.json();
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

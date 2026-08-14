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

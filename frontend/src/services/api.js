// API configuration and calls for the backend Express server
const API_BASE_URL = 'http://localhost:5000/api';

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

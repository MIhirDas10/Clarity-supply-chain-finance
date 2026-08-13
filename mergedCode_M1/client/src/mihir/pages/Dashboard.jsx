import React, { useState, useEffect } from 'react';
import InvoiceCard from '../components/InvoiceTracker/InvoiceCard';
import { getInvoices } from '../services/api';

const Dashboard = () => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadData = () => {
        setLoading(true);
        setError(null);
        getInvoices()
            .then(data => {
                if (Array.isArray(data)) {
                    setInvoices(data);
                } else {
                    // API returned an error object instead of an array
                    setError(data?.error || 'Failed to load invoices');
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError(err.message || 'Network error');
                setLoading(false);
            });
    };

    useEffect(() => {
        loadData();
    }, []);

    let contentToRender = null;

    if (loading) {
        contentToRender = <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading live data from Supabase...</div>;
    } else if (error) {
        contentToRender = (
            <div style={{ padding: '32px', textAlign: 'center', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-lg)', color: '#B91C1C' }}>
                <strong>Could not load pipeline data:</strong> {error}
            </div>
        );
    } else if (invoices.length === 0) {
        contentToRender = (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                No invoice pipelines found. Upload a new invoice to start tracking.
            </div>
        );
    } else {
        let invoiceElements = [];
        for (let i = 0; i < invoices.length; i++) {
            let invoice = invoices[i];
            invoiceElements.push(<InvoiceCard key={invoice.id} invoice={invoice} />);
        }

        contentToRender = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {invoiceElements}
            </div>
        );
    }

    let refreshButtonText = 'Refresh Data';
    if (loading) {
        refreshButtonText = 'Refreshing...';
    }

    return (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{
                        margin: 0,
                        fontSize: '26px',
                        fontWeight: 'bold',
                        letterSpacing: '-0.025em',
                        color: 'var(--text-primary)'
                    }}>
                        Invoice Pipeline
                    </h1>
                    <p style={{
                        margin: '2px 0 0 0',
                        fontSize: '13px',
                        color: 'var(--text-secondary)'
                    }}>
                        Track and manage your active invoice pipelines.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        onClick={loadData}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '13px',
                            fontWeight: '500',
                            border: 'none',
                            cursor: 'pointer',
                            background: 'linear-gradient(135deg, #1E293B, #334155)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        {refreshButtonText}
                    </button>
                </div>
            </div>

            {contentToRender}
        </div>
    );
};

export default Dashboard;

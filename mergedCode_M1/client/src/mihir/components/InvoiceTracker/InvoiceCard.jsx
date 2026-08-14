import React from 'react';
import PipelineTracker from './PipelineTracker';

const InvoiceCard = ({ invoice }) => {
    return (
        <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--card-shadow)',
            padding: '24px',
            transition: 'box-shadow 0.2s ease',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', color: 'var(--text-primary)', fontWeight: '600' }}>
                        Invoice #{invoice.number}
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Buyer: <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{invoice.buyerName}</span>
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ 
                        fontSize: '18px', 
                        fontWeight: 'bold', 
                        color: 'var(--text-primary)',
                        marginBottom: '4px'
                    }}>
                        ৳ {invoice.amount}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Due: {new Date(invoice.dueDate).toLocaleDateString()}
                    </div>
                </div>
            </div>

            <div style={{ 
                fontSize: '11px', 
                fontWeight: '600', 
                color: 'var(--text-muted)', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em',
                marginBottom: '16px' 
            }}>
                Invoice Status Pipeline
            </div>
            
            <PipelineTracker currentStage={invoice.currentStage} history={invoice.history || []} />
        </div>
    );
};

export default InvoiceCard;

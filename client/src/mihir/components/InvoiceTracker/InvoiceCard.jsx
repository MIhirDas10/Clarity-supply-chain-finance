import React, { useState } from 'react';
import PipelineTracker from './PipelineTracker';
import { updateInvoiceStatus } from '../../services/api';
import { useAuth } from '../../../auth/AuthContext';

const stages = ['Submitted', 'Buyer Confirmed', 'Funded', 'Payout Initiated', 'Completed'];

const InvoiceCard = ({ invoice }) => {
    const [updating, setUpdating] = useState(false);
    const { user } = useAuth();

    // Compute the logical next stage
    const currentIndex = stages.indexOf(invoice.currentStage);
    const nextStage = currentIndex >= 0 && currentIndex < stages.length - 1 ? stages[currentIndex + 1] : null;
    const canAdvance = user?.role === 'admin' && nextStage;

    const handleAdvance = async () => {
        if (!nextStage) return;
        setUpdating(true);
        try {
            await updateInvoiceStatus(invoice.id, nextStage, 'Admin', 'supplier@example.com');
            // Reload the page to fetch the new pipeline state
            window.location.reload();
        } catch (error) {
            console.error('Failed to update status', error);
            alert('Failed to update status: ' + error.message);
        } finally {
            setUpdating(false);
        }
    };

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
                    
                    {canAdvance && (
                        <button 
                            onClick={handleAdvance}
                            disabled={updating}
                            style={{
                                marginTop: '12px',
                                padding: '6px 12px',
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                cursor: updating ? 'not-allowed' : 'pointer',
                                opacity: updating ? 0.7 : 1
                            }}
                        >
                            {updating ? 'Advancing...' : `Advance to ${nextStage}`}
                        </button>
                    )}
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

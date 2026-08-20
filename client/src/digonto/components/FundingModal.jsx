import React, { useState } from 'react';

const FundingModal = ({ invoice, funder, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!invoice) return null;

  const handleFund = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/marketplace/${invoice.id}/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funderId: funder.id, funderName: funder.name })
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('This invoice has already been claimed by another funder or is no longer available.');
        }
        throw new Error('Failed to fund the invoice. Please try again.');
      }

      await response.json();
      onSuccess(invoice.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const amount = parseFloat(invoice.invoice_amount || invoice.amount || 0);
  const yieldPct = parseFloat(invoice.expected_yield || 0);
  const yieldAmount = (amount * yieldPct) / 100;
  const projectedEarnings = amount + yieldAmount;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Confirm Funding</h2>
        
        {error && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded border border-red-200">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-6 text-slate-700">
          <div className="flex justify-between">
            <span>Investment Amount:</span>
            <span className="font-semibold text-slate-900">৳ {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span>Expected Repayment:</span>
            <span className="font-semibold text-slate-900">
              {new Date(invoice.due_date).toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Expected Yield:</span>
            <span className="font-semibold text-emerald-600">{yieldPct.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between border-t pt-3">
            <span className="font-semibold">Projected Earnings:</span>
            <span className="font-semibold text-slate-900">৳ {projectedEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button 
            className="px-4 py-2 text-slate-600 border border-slate-300 rounded hover:bg-slate-50 transition"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            className="px-4 py-2 bg-slate-900 text-white rounded hover:bg-slate-800 transition disabled:opacity-50"
            onClick={handleFund}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Fund Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FundingModal;

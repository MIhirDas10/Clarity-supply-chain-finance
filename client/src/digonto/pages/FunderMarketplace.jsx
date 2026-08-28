import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import FundingModal from '../components/FundingModal';


const mockFunders = [
  { id: 'F-1', name: 'BRAC Bank' },
  { id: 'F-2', name: 'IDLC Finance' },
  { id: 'F-3', name: 'City Bank NBFI' }
];

const FunderMarketplace = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const selectedFunder = user ? { id: `F-${user.id}`, name: user.business_name } : null;
  const [filterRating, setFilterRating] = useState('All');
  const [kybSubmitted, setKybSubmitted] = useState(true);
  
  // Modal state
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const fetchInvoices = async () => {
    try {
      const response = await fetch(`/api/marketplace/invoices?riskRating=${filterRating}`);
      const data = await response.json();
      setInvoices(data);
    } catch (error) {
      console.error('Error fetching marketplace invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [filterRating]);

  useEffect(() => {
    // Check KYB status
    const checkKybStatus = async () => {
      try {
        const token = localStorage.getItem('clarity_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch('/api/documents', { headers });
        if (response.ok) {
          const docs = await response.json();
          if (docs.length === 0 || !docs.some(d => d.status === 'Approved')) {
            setKybSubmitted(false);
          }
        }
      } catch (error) {
        console.error('Error checking KYB status:', error);
      }
    };

    checkKybStatus();
  }, []);

  const handleFundSuccess = (invoiceId) => {
    // Remove funded invoice from the list
    setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    setSelectedInvoice(null);
  };

  // Grouping for featured
  const featuredInvoices = invoices.filter(inv => inv.risk_rating === 'Rating A').slice(0, 3);

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header & Funder Selector */}
        <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Marketplace</h1>
            <p className="text-slate-500 mt-1">Discover and fund high-yield invoice discounting opportunities.</p>
          </div>
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-900 text-white text-sm font-semibold uppercase">
              {(selectedFunder?.name || '?').charAt(0)}
            </span>
            <div className="leading-tight">
              <p className="text-xs text-slate-500">Signed in as</p>
              <p className="text-sm font-semibold text-slate-900">{selectedFunder?.name || 'Loading...'}</p>
            </div>
          </div>
        </div>

        {!kybSubmitted && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm flex flex-col md:flex-row items-center justify-between">
            <div className="mb-2 md:mb-0">
              <h3 className="font-bold text-red-800">Action Required: KYB Verification Incomplete</h3>
              <p className="text-red-700 text-sm">You must upload your KYB documents in the Document Vault and wait for Admin approval before you can fund invoices.</p>
            </div>
            <a href="/funder/vault" className="px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 transition">
              Go to Document Vault
            </a>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <label className="text-sm font-semibold text-slate-700">Filter by Risk:</label>
          <select 
            value={filterRating} 
            onChange={e => setFilterRating(e.target.value)}
            className="border border-slate-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="All">All Ratings</option>
            <option value="Rating A">Rating A</option>
            <option value="Rating B">Rating B</option>
            <option value="Rating C">Rating C</option>
          </select>
        </div>

        {/* Featured Section */}
        {featuredInvoices.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              🌟 Featured Low Risk Opportunities
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredInvoices.map(inv => (
                <div key={inv.id} className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm hover:shadow-md transition">
                  <div className="flex justify-between items-start mb-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                      {inv.risk_rating}
                    </span>
                    <span className="text-emerald-600 font-bold text-lg">{parseFloat(inv.expected_yield).toFixed(2)}% Yield</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{inv.supplier_name || `Supplier #${inv.supplier_id}`}</h3>
                  <p className="text-sm text-slate-500 mb-4">Buyer: {inv.buyer_name}</p>
                  <div className="flex justify-between text-sm mb-6">
                    <div>
                      <p className="text-slate-500">Amount</p>
                      <p className="font-semibold text-slate-900">৳ {parseFloat(inv.invoice_amount || inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-500">Maturity</p>
                      <p className="font-semibold text-slate-900">{new Date(inv.due_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedInvoice(inv)}
                    disabled={!kybSubmitted}
                    className="w-full py-2 bg-slate-900 text-white rounded hover:bg-slate-800 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!kybSubmitted ? "Please submit KYB documents first" : "Fund this invoice"}
                  >
                    Fund Invoice
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* All Open Listings */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4">All Open Listings</h2>
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading invoices...</div>
            ) : invoices.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No open listings available.</div>
            ) : (
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Buyer / Supplier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rating</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Maturity Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Expected Yield</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{inv.buyer_name}</div>
                        <div className="text-xs text-slate-500">{inv.supplier_name || `Supplier #${inv.supplier_id}`}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          inv.risk_rating === 'Rating A' ? 'bg-emerald-100 text-emerald-800' :
                          inv.risk_rating === 'Rating B' ? 'bg-blue-100 text-blue-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {inv.risk_rating || 'Unrated'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        ৳ {parseFloat(inv.invoice_amount || inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {new Date(inv.due_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-emerald-600">
                        {parseFloat(inv.expected_yield || 0).toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button 
                          onClick={() => setSelectedInvoice(inv)}
                          disabled={!kybSubmitted}
                          title={!kybSubmitted ? "Please submit KYB documents first" : "Fund this invoice"}
                          className="text-slate-600 hover:text-slate-900 font-semibold border border-slate-300 rounded px-3 py-1 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Fund
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

      </div>

      {selectedInvoice && (
        <FundingModal 
          invoice={selectedInvoice}
          funder={selectedFunder}
          onClose={() => setSelectedInvoice(null)}
          onSuccess={handleFundSuccess}
        />
      )}
    </div>
  );
};

export default FunderMarketplace;

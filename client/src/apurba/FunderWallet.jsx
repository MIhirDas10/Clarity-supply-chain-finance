import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

// Same demo funders the Marketplace page uses ("Acting as: ..."), so a
// balance topped up here is the same balance the Marketplace/Auto-Invest
// pages spend from.
const mockFunders = [
  { id: 'F-1', name: 'BRAC Bank' },
  { id: 'F-2', name: 'IDLC Finance' },
  { id: 'F-3', name: 'City Bank NBFI' },
  { id: 'F-14', name: 'jhv' },
];

function formatTaka(amount) {
  return '৳ ' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const FunderWallet = () => {
  const { user } = useAuth();
  const [funder, setFunder] = useState(mockFunders[0]);
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState('');

  const authHeaders = () => {
    const token = localStorage.getItem('clarity_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadWallet = async (funderId) => {
    const res = await fetch(`/api/wallet/${funderId}?funderName=${encodeURIComponent(funder.name)}`, {
      headers: authHeaders(),
    });
    setWallet(await res.json());
  };

  useEffect(() => {
    if (user?.role === 'funder') {
      const loggedInFunder = { id: `F-${user.id}`, name: user.business_name };
      setFunder(loggedInFunder);
    }
  }, [user?.id, user?.business_name, user?.role]);

  useEffect(() => {
    loadWallet(funder.id);
  }, [funder]);

  // UddoktaPay redirects back here with ?invoice_id=... once the funder
  // completes (or cancels) the payment on its sandbox checkout page. If
  // that param is present, this deposit still needs to be confirmed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uddoktapayId = params.get('invoice_id');
    if (!uddoktapayId) return;

    setVerifying(true);
    fetch('/api/wallet/deposit/verify', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ uddoktapay_id: uddoktapayId }),
    })
      .then((res) => res.json())
      .then((data) => {
        setMessage(data.status === 'Completed' ? 'Deposit confirmed.' : 'Payment was not completed.');
        window.history.replaceState({}, '', '/wallet');
        loadWallet(funder.id);
      })
      .finally(() => setVerifying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    setDepositing(true);
    setMessage('');
    try {
      const res = await fetch('/api/wallet/deposit/init', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ funder_id: funder.id, funder_name: funder.name, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // Hands off to UddoktaPay's own checkout page (bKash/Nagad/Rocket
      // choices live there) - it redirects back to this page when done.
      window.location.href = data.payment_url;
    } catch (err) {
      setMessage(err.message || 'Could not start the deposit');
      setDepositing(false);
    }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Funder Wallet</h1>
            <p className="text-slate-500 mt-1">Top up by bKash/Nagad/Rocket through UddoktaPay, then fund invoices from the balance.</p>
          </div>
          <select
            value={funder.id}
            onChange={(e) => setFunder(mockFunders.find((f) => f.id === e.target.value))}
            className="border border-slate-300 rounded p-2 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {mockFunders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        {verifying && (
          <div className="p-4 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">Confirming your payment with UddoktaPay...</div>
        )}
        {message && !verifying && (
          <div className="p-4 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">{message}</div>
        )}

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Available balance</p>
          <p className="text-4xl font-bold text-slate-900 mt-1">
            {wallet ? formatTaka(wallet.balance) : '...'}
          </p>

          <form onSubmit={handleDeposit} className="flex gap-3 mt-6">
            <input
              type="number"
              min="1"
              step="0.01"
              placeholder="Amount to deposit"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 border border-slate-300 rounded p-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              type="submit"
              disabled={depositing}
              className="px-6 py-2.5 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 transition disabled:opacity-50"
            >
              {depositing ? 'Redirecting...' : 'Deposit via UddoktaPay'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <h2 className="text-lg font-semibold text-slate-900 p-6 pb-0">Transaction history</h2>
          {!wallet || wallet.transactions.length === 0 ? (
            <p className="p-6 text-slate-500">No transactions yet.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 mt-4">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Invoice</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Balance After</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {wallet.transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-6 py-3 text-sm text-slate-900">{tx.type}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{tx.invoice_number || tx.invoice_id || '—'}</td>
                    <td className={`px-6 py-3 text-sm text-right font-medium ${Number(tx.amount) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {Number(tx.amount) < 0 ? '-' : '+'}{formatTaka(Math.abs(tx.amount))}
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-slate-600">
                      {tx.balance_after !== null ? formatTaka(tx.balance_after) : '—'}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        tx.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">{new Date(tx.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default FunderWallet;

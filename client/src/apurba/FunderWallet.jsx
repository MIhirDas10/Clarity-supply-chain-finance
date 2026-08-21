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
  const [manualIds, setManualIds] = useState({}); // { [transactionId]: typed invoice id }
  const [confirmingRef, setConfirmingRef] = useState(null);

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

  // A deposit sits on Pending until UddoktaPay confirms the payment, which
  // happens on their side, not ours - so there is no event to listen for.
  const hasPendingDeposit = (wallet?.transactions || []).some(
    (tx) => tx.status === 'Pending' && tx.type === 'Deposit'
  );

  useEffect(() => {
    if (user?.role === 'funder') {
      const loggedInFunder = { id: `F-${user.id}`, name: user.business_name };
      setFunder(loggedInFunder);
    }
  }, [user?.id, user?.business_name, user?.role]);

  useEffect(() => {
    loadWallet(funder.id);
  }, [funder]);

  // Auto-refresh, but only while a deposit is actually waiting on
  // UddoktaPay. Once everything has settled the polling stops by itself,
  // so an idle wallet page is not sitting there hitting the server forever.
  useEffect(() => {
    if (!hasPendingDeposit) return;
    const timer = setInterval(() => loadWallet(funder.id), 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingDeposit, funder.id]);

  // Paying happens in another tab (UddoktaPay's checkout), so coming back to
  // this one is the moment the balance is most likely to be out of date.
  useEffect(() => {
    const refresh = () => loadWallet(funder.id);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funder.id]);

  // UddoktaPay redirects back here with ?invoice_id=... once the funder
  // completes (or cancels) the payment on its sandbox checkout page. ref is
  // our own tracking id (added to the redirect url when the deposit was
  // started) - confirmed against the real sandbox that UddoktaPay's own
  // invoice_id here is NOT the id it originally returned when the charge was
  // created, so ref is what actually finds the right pending deposit.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uddoktapayId = params.get('invoice_id');
    const ref = params.get('ref');
    if (!uddoktapayId || !ref) return;

    setVerifying(true);
    fetch('/api/wallet/deposit/verify', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, uddoktapay_id: uddoktapayId }),
    })
      .then((res) => res.json())
      .then((data) => {
        setMessage(data.status === 'Completed' ? 'Deposit confirmed.' : 'Payment was not completed.');
        window.history.replaceState({}, '', window.location.pathname);
        loadWallet(funder.id);
      })
      .finally(() => setVerifying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UddoktaPay's automatic redirect back to this page only works if this app
  // is reachable at a public URL - it can't reach a developer's own
  // localhost, so on localhost the redirect frequently fails to load at
  // all. This lets a funder finish a stuck deposit anyway: UddoktaPay always
  // shows its own "Invoice ID" on the payment page after a transaction is
  // entered, and pasting that in here calls the exact same verify step the
  // automatic redirect would have.
  const confirmManually = async (tx) => {
    const typedId = (manualIds[tx.id] || '').trim();
    if (!typedId) return;

    setConfirmingRef(tx.id);
    try {
      const res = await fetch('/api/wallet/deposit/verify', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: tx.client_ref, uddoktapay_id: typedId }),
      });
      const data = await res.json();
      setMessage(
        data.status === 'Completed' ? 'Deposit confirmed.' : (data.message || 'Payment was not completed yet.')
      );
      loadWallet(funder.id);
    } finally {
      setConfirmingRef(null);
    }
  };

  // Throws away a deposit that was started but never actually paid.
  const discardDeposit = async (tx) => {
    setConfirmingRef(tx.id);
    try {
      await fetch(`/api/wallet/deposit/${tx.client_ref}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setMessage('Unpaid deposit discarded.');
      loadWallet(funder.id);
    } finally {
      setConfirmingRef(null);
    }
  };

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
      <div className="max-w-5xl mx-auto space-y-6">
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
          <div className="flex items-center justify-between p-6 pb-0">
            <h2 className="text-lg font-semibold text-slate-900">Transaction history</h2>
            {hasPendingDeposit && (
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Checking for payment confirmation...
              </span>
            )}
          </div>
          <p className="px-6 text-xs text-slate-500 mt-1">
            A deposit stays on "Pending" until UddoktaPay confirms it. If it does not clear on its own,
            paste the "Invoice ID" from UddoktaPay's payment page into the row below to confirm it by hand.
          </p>
          {!wallet || wallet.transactions.length === 0 ? (
            <p className="p-6 text-slate-500">No transactions yet.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 mt-4">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Invoice</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Balance After</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {wallet.transactions.map((tx) => {
                  const awaitingPayment = tx.status === 'Pending' && tx.type === 'Deposit';
                  return (
                    <React.Fragment key={tx.id}>
                      <tr className={awaitingPayment ? 'bg-amber-50/40' : undefined}>
                        <td className="px-6 py-3 text-sm text-slate-900 whitespace-nowrap">{tx.type}</td>
                        <td className="px-6 py-3 text-sm text-slate-600 whitespace-nowrap">{tx.invoice_number || tx.invoice_id || '—'}</td>
                        <td className={`px-6 py-3 text-sm text-right font-medium whitespace-nowrap ${Number(tx.amount) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {Number(tx.amount) < 0 ? '-' : '+'}{formatTaka(Math.abs(tx.amount))}
                        </td>
                        <td className="px-6 py-3 text-sm text-right text-slate-600 whitespace-nowrap">
                          {tx.balance_after !== null ? formatTaka(tx.balance_after) : '—'}
                        </td>
                        <td className="px-6 py-3 text-sm whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            tx.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-500 whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>
                      </tr>

                      {/* Its own row rather than squeezed into the status cell,
                          so the three controls have room to sit on one line. */}
                      {awaitingPayment && (
                        <tr className="bg-amber-50/40">
                          <td colSpan={6} className="px-6 pb-3 pt-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-slate-500">Already paid this one?</span>
                              <input
                                type="text"
                                placeholder="Paste UddoktaPay Invoice ID"
                                value={manualIds[tx.id] || ''}
                                onChange={(e) => setManualIds({ ...manualIds, [tx.id]: e.target.value })}
                                className="w-56 border border-slate-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                              />
                              <button
                                onClick={() => confirmManually(tx)}
                                disabled={confirmingRef === tx.id || !manualIds[tx.id]}
                                className="px-3 py-1 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 transition disabled:opacity-50"
                              >
                                {confirmingRef === tx.id ? 'Checking...' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => discardDeposit(tx)}
                                disabled={confirmingRef === tx.id}
                                className="px-3 py-1 text-slate-500 border border-slate-300 rounded text-xs font-medium bg-white hover:bg-slate-100 transition disabled:opacity-50"
                                title="This deposit was never paid - remove it from the list"
                              >
                                Discard
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default FunderWallet;

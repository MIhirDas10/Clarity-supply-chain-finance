import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

// Who the wallet belongs to is not known until the logged-in user has been
// resolved, so this page starts with no funder at all rather than guessing
// one. Guessing used to mean briefly loading a DIFFERENT funder's wallet.

function formatTaka(amount) {
  return '৳ ' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const FunderWallet = () => {
  const { user } = useAuth();
  const [funders, setFunders] = useState([]);
  const [funder, setFunder] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [amount, setAmount] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [kybSubmitted, setKybSubmitted] = useState(true);
  const [message, setMessage] = useState('');
  const [manualIds, setManualIds] = useState({}); // { [transactionId]: typed invoice id }
  const [confirmingRef, setConfirmingRef] = useState(null);
  const [bankQuery, setBankQuery] = useState('');
  const [bankListOpen, setBankListOpen] = useState(false);
  const bankBoxRef = useRef(null);

  // A logged-in funder always acts as themselves - they can only deposit into
  // their own wallet, so there is nothing for them to pick. The bank list is
  // only a stand-in identity for when nobody is signed in as a funder.
  const isFunder = user?.role === 'funder';

  // Filters as you type; matches anywhere in the name, not just the start,
  // so typing "city" finds "The City Bank PLC" - a plain <select> only
  // jumps on the first letter, which is what "search isn't working" meant.
  const filteredBanks = bankQuery.trim()
    ? funders.filter((f) => (f.name || '').toLowerCase().includes(bankQuery.trim().toLowerCase()))
    : funders;

  // Closes the dropdown when a click lands anywhere outside it.
  useEffect(() => {
    const closeOnOutsideClick = (e) => {
      if (bankBoxRef.current && !bankBoxRef.current.contains(e.target)) {
        setBankListOpen(false);
        setBankQuery('');
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const authHeaders = () => {
    const token = localStorage.getItem('clarity_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadWallet = async (funderId, funderName) => {
    const res = await fetch(`/api/wallet/${funderId}?funderName=${encodeURIComponent(funderName)}`, {
      headers: authHeaders(),
    });
    setWallet(await res.json());
  };

  // Asks for a fresh copy of the wallet. Everything that changes the balance
  // calls this instead of fetching directly, so none of them can fire with a
  // stale funder captured from an old render.
  const refresh = () => setReloadKey((key) => key + 1);

  // A deposit sits on Pending until bKash confirms the payment, which
  // happens on their side, not ours - so there is no event to listen for.
  const hasPendingDeposit = (wallet?.transactions || []).some(
    (tx) => tx.status === 'Pending' && tx.type === 'Deposit'
  );

  useEffect(() => {
    // Fetch dynamic funders (Banks in Bangladesh)
    const fetchFunders = async () => {
      try {
        const response = await fetch('/api/auth/banks');
        const data = await response.json();
        if (data && data.length > 0) {
          setFunders(data);
          
          // Use logged in user if available, otherwise first bank
          if (user?.role === 'funder') {
            setFunder({ id: `F-${user.id}`, name: user.business_name });
          } else {
            setFunder(data[0]);
          }
        }
      } catch (error) {
        console.error('Error fetching funders:', error);
      }
    };

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

    fetchFunders();
    checkKybStatus();
  }, [user?.id, user?.business_name, user?.role]);

  // Nothing is fetched until the funder is known - see the note at the top
  // of this file for why loading "whoever is first" was actively wrong.
  useEffect(() => {
    if (!funder) return;
    loadWallet(funder.id, funder.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funder, reloadKey]);

  // Auto-refresh, but only while a deposit is actually waiting on bKash.
  // Once everything has settled the polling stops by itself, so an idle
  // wallet page is not sitting there hitting the server forever.
  useEffect(() => {
    if (!funder || !hasPendingDeposit) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingDeposit, funder?.id]);

  // Paying happens in another tab (bKash's checkout), so coming back to
  // this one is the moment the balance is most likely to be out of date.
  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  // bKash redirects back here with ?paymentID=...&status=... once the
  // funder completes (or cancels/fails) the payment on its checkout page.
  // paymentID is bKash's own id for the charge - unlike the gateway this
  // feature used before, it is the SAME id from creation through execution,
  // so no separate tracking reference is needed to find the deposit again.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentID = params.get('paymentID');
    if (!paymentID) return;

    setVerifying(true);
    fetch('/api/wallet/deposit/verify', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentID }),
    })
      .then((res) => res.json())
      .then((data) => {
        setMessage(data.status === 'Completed' ? 'Deposit confirmed.' : 'Payment was not completed.');
        window.history.replaceState({}, '', window.location.pathname);
        refresh();
      })
      .finally(() => setVerifying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // bKash's automatic redirect back to this page only works if this app is
  // reachable at a public URL - it can't reach a developer's own localhost,
  // so on localhost the redirect can fail to load at all. This lets a
  // funder finish a stuck deposit anyway: bKash's own checkout page shows
  // the Payment ID after a transaction completes, and pasting it in here
  // calls the exact same verify step the automatic redirect would have.
  const confirmManually = async (tx) => {
    const typedId = (manualIds[tx.id] || '').trim();
    if (!typedId) return;

    setConfirmingRef(tx.id);
    try {
      const res = await fetch('/api/wallet/deposit/verify', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentID: typedId }),
      });
      const data = await res.json();
      setMessage(
        data.status === 'Completed' ? 'Deposit confirmed.' : (data.message || 'Payment was not completed yet.')
      );
      refresh();
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
      refresh();
    } finally {
      setConfirmingRef(null);
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!funder || !amount || Number(amount) <= 0) return;

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

      // Hands off to bKash's own checkout page - it redirects back to
      // this page when done.
      window.location.href = data.payment_url;
    } catch (err) {
      setMessage(err.message || 'Could not start the deposit');
      setDepositing(false);
    }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Funder Wallet</h1>
            <p className="text-slate-500 mt-1">Top up your wallet via bKash, then fund invoices from the balance.</p>
          </div>
          {isFunder ? (
            // Signed in as a funder: show who this wallet belongs to, as plain
            // text. It used to sit in an editable-looking box, which made an
            // account name read like a half-broken search field.
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-900 text-white text-sm font-semibold uppercase">
                {(funder?.name || '?').charAt(0)}
              </span>
              <div className="leading-tight">
                <p className="text-xs text-slate-500">Signed in as</p>
                <p className="text-sm font-semibold text-slate-900">{funder?.name || 'Loading...'}</p>
              </div>
            </div>
          ) : (
            funders.length > 0 && (
              <div className="relative w-full sm:w-64" ref={bankBoxRef}>
                <label className="block text-xs font-medium text-slate-500 mb-1">Acting as</label>
                <input
                  type="text"
                  value={bankListOpen ? bankQuery : (funder?.name || '')}
                  onChange={(e) => { setBankQuery(e.target.value); setBankListOpen(true); }}
                  onFocus={() => { setBankQuery(''); setBankListOpen(true); }}
                  placeholder="Search bank..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                {bankListOpen && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                    {filteredBanks.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-slate-400">No bank matches "{bankQuery}"</p>
                    ) : (
                      filteredBanks.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => { setFunder(f); setBankQuery(''); setBankListOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition ${
                            f.id === funder?.id ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-700'
                          }`}
                        >
                          {f.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {!kybSubmitted && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm flex flex-col md:flex-row items-center justify-between mb-8">
            <div className="mb-2 md:mb-0">
              <h3 className="font-bold text-red-800">Action Required: KYB Verification Incomplete</h3>
              <p className="text-red-700 text-sm">You must upload your KYB documents in the Document Vault and wait for Admin approval before you can deposit funds.</p>
            </div>
            <a href="/funder/vault" className="px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 transition">
              Go to Document Vault
            </a>
          </div>
        )}

        {verifying && (
          <div className="p-4 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">Confirming your payment with bKash...</div>
        )}
        {message && !verifying && (
          <div className="p-4 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">{message}</div>
        )}

        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">Available balance</p>
          <p className="text-4xl font-bold text-slate-900 mt-1">
            {wallet ? formatTaka(wallet.balance) : '...'}
          </p>

          <form onSubmit={handleDeposit} className="flex flex-col sm:flex-row gap-3 mt-6">
            <input
              type="number"
              placeholder="Enter amount (৳)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!kybSubmitted || !funder}
              className="flex-1 border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#E2136E] disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!funder || !amount || isNaN(amount) || amount <= 0 || depositing || !kybSubmitted}
              className="px-6 py-3 bg-[#E2136E] text-white rounded-lg font-semibold hover:bg-[#c00f5e] transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              title={!kybSubmitted ? "Please submit KYB documents first" : ""}
            >
              {depositing ? 'Processing...' : 'Deposit via bKash'}
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
            A deposit stays on "Pending" until bKash confirms it. If it does not clear on its own,
            paste the Payment ID from bKash's checkout page into the row below to confirm it by hand.
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
                                placeholder="Paste bKash Payment ID"
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

import React, { useState, useEffect } from 'react';

const mockFunders = [
  { id: 'F-1', name: 'BRAC Bank' },
  { id: 'F-2', name: 'IDLC Finance' },
  { id: 'F-3', name: 'City Bank NBFI' },
];

const RATINGS = ['Rating A', 'Rating B', 'Rating C'];

function formatTaka(amount) {
  return '৳ ' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const emptyForm = { min_amount: '', max_amount: '', min_risk_rating: 'Rating B', max_capital_per_invoice: '' };

const AutoInvestRules = () => {
  const [funder, setFunder] = useState(mockFunders[0]);
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [error, setError] = useState('');

  const loadRules = async (funderId) => {
    const res = await fetch(`/api/auto-invest/rules?funder_id=${funderId}`);
    setRules(await res.json());
  };

  useEffect(() => {
    loadRules(funder.id);
    setRunResult(null);
  }, [funder]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.max_capital_per_invoice || Number(form.max_capital_per_invoice) <= 0) {
      setError('Max capital per invoice is required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/auto-invest/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, funder_id: funder.id, funder_name: funder.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setForm(emptyForm);
      loadRules(funder.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rule) => {
    await fetch(`/api/auto-invest/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    loadRules(funder.id);
  };

  const deleteRule = async (id) => {
    await fetch(`/api/auto-invest/rules/${id}`, { method: 'DELETE' });
    loadRules(funder.id);
  };

  const runEngine = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/auto-invest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funder_id: funder.id }),
      });
      setRunResult(await res.json());
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Auto-Invest Rules</h1>
            <p className="text-slate-500 mt-1">Set standing criteria once - the engine funds any matching invoice from your wallet automatically.</p>
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

        <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">New rule</h2>
          {error && <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded border border-red-200">{error}</div>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Min amount (৳)</label>
              <input type="number" min="0" value={form.min_amount}
                onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
                className="w-full border border-slate-300 rounded p-2" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Max amount (৳)</label>
              <input type="number" min="0" value={form.max_amount}
                onChange={(e) => setForm({ ...form, max_amount: e.target.value })}
                className="w-full border border-slate-300 rounded p-2" placeholder="No limit" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Minimum risk rating</label>
              <select value={form.min_risk_rating}
                onChange={(e) => setForm({ ...form, min_risk_rating: e.target.value })}
                className="w-full border border-slate-300 rounded p-2">
                {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Max per invoice (৳)</label>
              <input type="number" min="0" value={form.max_capital_per_invoice}
                onChange={(e) => setForm({ ...form, max_capital_per_invoice: e.target.value })}
                className="w-full border border-slate-300 rounded p-2" placeholder="Required" />
            </div>
          </div>
          <button type="submit" disabled={saving}
            className="mt-4 px-6 py-2.5 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Create rule'}
          </button>
        </form>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex justify-between items-center p-6 pb-0">
            <h2 className="text-lg font-semibold text-slate-900">Your rules</h2>
            <button onClick={runEngine} disabled={running}
              className="px-4 py-2 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700 transition disabled:opacity-50">
              {running ? 'Running...' : 'Run Auto-Invest Now'}
            </button>
          </div>

          {rules.length === 0 ? (
            <p className="p-6 text-slate-500">No rules yet - create one above.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 mt-4">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount range</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Min rating</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Cap / invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="px-6 py-3 text-sm text-slate-900">
                      {formatTaka(rule.min_amount)} – {rule.max_amount ? formatTaka(rule.max_amount) : 'No limit'}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-900">{rule.min_risk_rating}</td>
                    <td className="px-6 py-3 text-sm text-right text-slate-900">{formatTaka(rule.max_capital_per_invoice)}</td>
                    <td className="px-6 py-3 text-sm">
                      <button onClick={() => toggleActive(rule)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          rule.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                        {rule.is_active ? 'Active' : 'Paused'}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => deleteRule(rule.id)} className="text-sm text-red-600 hover:text-red-800 font-medium">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {runResult && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Last run</h2>
            <p className="text-sm text-slate-600 mb-2">{runResult.rules_checked} active rule(s) checked.</p>
            {runResult.funded.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium text-emerald-700 mb-1">Funded {runResult.funded.length} invoice(s):</p>
                <ul className="text-sm text-slate-600 list-disc pl-5">
                  {runResult.funded.map((f) => (
                    <li key={f.invoice_id}>Invoice #{f.invoice_id} — {formatTaka(f.amount)}</li>
                  ))}
                </ul>
              </div>
            )}
            {runResult.skipped.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-1">Skipped {runResult.skipped.length}:</p>
                <ul className="text-sm text-slate-600 list-disc pl-5">
                  {runResult.skipped.map((s, i) => (
                    <li key={i}>Invoice #{s.invoice_id} — {s.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {runResult.funded.length === 0 && runResult.skipped.length === 0 && (
              <p className="text-sm text-slate-500">No matching invoices were found this time.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoInvestRules;

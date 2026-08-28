import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    FileSpreadsheet, RefreshCw, Link2, Power, CheckCircle2, AlertTriangle,
    Users, ScrollText, ExternalLink, Wallet, Clock, Landmark, Banknote,
    ShieldAlert, Settings2, Zap, Loader2, Plus, Pencil, Trash2, X, Database
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';

// The global fetch interceptor (main.jsx) attaches the JWT, so plain fetch is fine.
async function readJson(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; }
    catch { return { message: text.slice(0, 160) || response.statusText }; }
}

const jsonReq = (method) => async (u, b) => {
    const response = await fetch(u, { method, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    return { ok: response.ok, status: response.status, data: await readJson(response) };
};
const api = {
    get: async (u) => {
        const response = await fetch(u);
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.detail ? `${data.message}: ${data.detail}` : data.message || `Request failed (${response.status})`);
        return data;
    },
    post: jsonReq('POST'),
    patch: jsonReq('PATCH'),
    del: async (u) => {
        const response = await fetch(u, { method: 'DELETE' });
        return { ok: response.ok, status: response.status, data: await readJson(response) };
    },
};

const STATUS_OPTIONS = ['Payable', 'Funded', 'Paid', 'Disputed', 'Pending', 'Voided', 'Overdue'];
const emptyForm = {
    invoice_number: '', supplier_name: '', amount: '', tax_amount: '', due_date: '',
    erp_status: 'Payable', po_number: '', gl_code: '', department: '', payment_terms: '', note: ''
};

const taka = (n) => n == null || n === '' ? '—' : '৳' + Number(n).toLocaleString();

function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
}

const STATUS = {
    Payable: { cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    Funded: { cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
    Paid: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    Disputed: { cls: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
    Overdue: { cls: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
    Voided: { cls: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
    Pending: { cls: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};
const statusStyle = (s) => STATUS[s] || STATUS.Pending;

export default function ErpIntegration() {
    const { user } = useAuth();
    const [status, setStatus] = useState(null);
    const [ledger, setLedger] = useState([]);
    const [log, setLog] = useState([]);
    const [suppliers, setSuppliers] = useState(null);
    const [reconciliation, setReconciliation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [flash, setFlash] = useState('');
    const [cfg, setCfg] = useState({ spreadsheet_id: '', ap_sheet: 'Accounts Payable', supplier_sheet: 'Suppliers', delete_on_dispute: false });
    const [modal, setModal] = useState(null); // null | { mode: 'create' | 'edit', id? }
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const prevStatuses = useRef({});

    const refresh = useCallback(async (withSuppliers) => {
        try {
            const [st, lg, lo] = await Promise.all([
                api.get('/api/erp/status'), api.get('/api/erp/ledger'), api.get('/api/erp/log?limit=30'),
            ]);
            setStatus(st);
            if (st.connection) setCfg(c => ({ ...c, spreadsheet_id: st.connection.spreadsheet_id || '', ap_sheet: st.connection.ap_sheet || 'Accounts Payable', supplier_sheet: st.connection.supplier_sheet || 'Suppliers', delete_on_dispute: !!st.connection.delete_on_dispute }));
            // flag rows whose status changed since last poll (real-time highlight)
            const rows = Array.isArray(lg) ? lg : [];
            const next = {};
            rows.forEach(r => { next[r.invoice_id] = r.erp_status; });
            rows.forEach(r => { r._changed = prevStatuses.current[r.invoice_id] && prevStatuses.current[r.invoice_id] !== r.erp_status; });
            prevStatuses.current = next;
            setLedger(rows);
            setLog(Array.isArray(lo) ? lo : []);
            if (withSuppliers) {
                api.get('/api/erp/suppliers').then(setSuppliers).catch(() => {});
                api.get('/api/erp/reconciliation').then(setReconciliation).catch(() => {});
            }
        } catch (error) {
            setFlash(error.message || 'Could not load ERP ledger.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(true); }, [refresh]);

    // Live polling every 4s while connected.
    useEffect(() => {
        if (!status?.connected) return;
        const id = setInterval(() => refresh(false), 4000);
        return () => clearInterval(id);
    }, [status?.connected, refresh]);

    const notify = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 3000); };

    async function enable() {
        setBusy('enable');
        const res = await api.post('/api/erp/enable');
        setBusy('');
        if (res.ok) { notify(`Ledger enabled · ${res.data.synced} invoices synced`); refresh(true); }
    }
    async function connectGoogle() {
        setBusy('connect');
        await api.post('/api/erp/config', cfg); // save config first so sheet id is stored when a ledger is already enabled
        const r = await api.get('/api/erp/connect').catch(() => null);
        setBusy('');
        if (r?.authorization_url) window.location.href = r.authorization_url;
        else notify('Google credentials are not configured on the server.');
    }
    async function disconnect() {
        setBusy('disconnect');
        await api.del('/api/erp/disconnect');
        setBusy('');
        prevStatuses.current = {};
        notify('Disconnected.'); refresh(true);
    }
    async function syncNow() {
        setBusy('sync');
        const res = await api.post('/api/erp/reconcile');
        setBusy('');
        if (res.ok) { notify(`Synced ${res.data.synced} invoices`); refresh(true); }
    }
    async function saveConfig() {
        setBusy('config');
        await api.post('/api/erp/config', cfg);
        setBusy('');
        notify('Settings saved.'); refresh(true);
    }
    async function createSheetTemplate() {
        setBusy('sheet');
        const res = await api.post('/api/erp/sheet-template');
        setBusy('');
        if (res.ok) { notify('Accounting sheet created and backfilled.'); refresh(true); }
        else notify(res.data?.message || 'Could not create the sheet.');
    }
    async function retryFailed() {
        setBusy('retry');
        const res = await api.post('/api/erp/retry-failed');
        setBusy('');
        if (res.ok) { notify(`Retry complete: ${res.data.synced} synced, ${res.data.failed} failed`); refresh(true); }
        else notify(res.data?.message || 'Could not retry failed syncs.');
    }
    async function notifyOverdue() {
        setBusy('overdue');
        const res = await api.post('/api/erp/notify-overdue');
        setBusy('');
        if (res.ok) notify(res.data.sent ? `Overdue alert sent for ${res.data.count} payable(s).` : 'No overdue payables to notify.');
        else notify(res.data?.message || 'Could not send overdue alert.');
    }
    async function notifyReconciliation() {
        setBusy('reconNotify');
        const res = await api.post('/api/erp/reconciliation/notify');
        setBusy('');
        if (res.ok) { setReconciliation(res.data); notify(res.data.notified ? 'Reconciliation alert sent.' : 'No reconciliation issues to notify.'); }
        else notify(res.data?.message || 'Could not send reconciliation alert.');
    }

    function openCreate() { setForm(emptyForm); setModal({ mode: 'create' }); }
    function openEdit(row) {
        setForm({
            invoice_number: row.invoice_number || '', supplier_name: row.supplier_name || '',
            amount: row.amount ?? '', tax_amount: row.tax_amount ?? '', due_date: row.due_date || '',
            erp_status: row.erp_status || 'Payable', po_number: row.po_number || '',
            gl_code: row.gl_code || '', department: row.department || '',
            payment_terms: row.payment_terms || '', note: row.note || ''
        });
        setModal({ mode: 'edit', id: row.invoice_id, source: row.source });
    }
    async function saveRow() {
        setSaving(true);
        let res;
        if (modal.mode === 'create') res = await api.post('/api/erp/ledger', form);
        else res = await api.patch('/api/erp/ledger/' + encodeURIComponent(modal.id), form);
        setSaving(false);
        if (res.ok) { setModal(null); notify(modal.mode === 'create' ? 'Payable added.' : 'Payable updated.'); refresh(false); }
        else notify(res.data?.message || 'Could not save.');
    }
    async function removeRow(row) {
        if (!window.confirm(`Delete payable “${row.invoice_number}”? This cannot be undone.`)) return;
        const res = await api.del('/api/erp/ledger/' + encodeURIComponent(row.invoice_id));
        if (res.ok) { notify('Payable removed.'); refresh(false); }
        else notify(res.data?.message || 'Could not delete.');
    }

    if (loading) {
        return (
            <div className="p-10 flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center text-slate-400">
                    <FileSpreadsheet className="w-10 h-10 animate-pulse text-emerald-400 mb-3" />
                    <p className="text-sm font-medium text-slate-500">Loading accounts-payable ledger…</p>
                </div>
            </div>
        );
    }

    const connected = status?.connected;
    const isGoogle = status?.mode === 'google';
    const sm = status?.summary || {};

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/40">
            <div className="p-6 sm:p-8 lg:p-10 max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-green-700 flex items-center justify-center shadow-lg shadow-emerald-900/10 shrink-0">
                            <FileSpreadsheet className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">ERP / Accounting Sync</h1>
                            <p className="text-slate-500 mt-1 text-sm max-w-xl">Your confirmed payables mirror into an accounts-payable ledger in real time — kept in Google Sheets, or right here.</p>
                        </div>
                    </div>
                    {connected && (
                        <div className="flex items-center gap-2.5">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                                Live
                            </span>
                            <button onClick={syncNow} disabled={busy === 'sync'}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-60 shadow-sm">
                                <RefreshCw className={`w-4 h-4 ${busy === 'sync' ? 'animate-spin' : ''}`} /> {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                            </button>
                        </div>
                    )}
                </div>

                {flash && (
                    <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> {flash}
                    </div>
                )}

                {/* Not set up yet */}
                {!connected && (
                    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-8 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                            <FileSpreadsheet className="w-7 h-7 text-emerald-600" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900">Turn on your accounts-payable ledger</h2>
                        <p className="text-sm text-slate-500 mt-2 max-w-lg mx-auto text-center">
                            Every invoice you confirm, that gets funded, disputed, or settled will appear here automatically —
                            no manual entry. Start with the built-in ledger, then optionally connect a real Google Sheet.
                        </p>
                        <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
                            <button onClick={enable} disabled={busy === 'enable'}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-60 shadow-sm">
                                {busy === 'enable' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                Enable in-app ledger
                            </button>
                            <button onClick={connectGoogle} disabled={busy === 'connect' || !status?.configured}
                                title={status?.configured ? '' : 'Google credentials not configured on the server'}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 active:scale-95 disabled:opacity-50 shadow-sm">
                                <Link2 className="w-4 h-4" /> Connect Google Sheets
                            </button>
                        </div>
                    </div>
                )}

                {connected && (
                    <>
                        {/* Connection card */}
                        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isGoogle ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                                        {isGoogle ? <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> : <Wallet className="w-5 h-5 text-slate-500" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                            {isGoogle ? 'Google Sheets connected' : 'In-app ledger active'}
                                            {isGoogle && status.connection?.google_linked && <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">Live sheet</span>}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {isGoogle ? 'Changes push to your spreadsheet and this ledger.' : 'Connect Google to also mirror into a real spreadsheet.'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isGoogle && (
                                        <button onClick={connectGoogle} disabled={busy === 'connect' || !status?.configured}
                                            title={status?.configured ? '' : 'Google credentials not configured on the server'}
                                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 active:scale-95 disabled:opacity-50">
                                            <Link2 className="w-4 h-4" /> Connect Google
                                        </button>
                                    )}
                                    {isGoogle && !cfg.spreadsheet_id && (
                                        <button onClick={createSheetTemplate} disabled={busy === 'sheet'}
                                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 active:scale-95 disabled:opacity-60">
                                            {busy === 'sheet' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Create sheet
                                        </button>
                                    )}
                                    {status.sync_health?.spreadsheet_url && (
                                        <a href={status.sync_health.spreadsheet_url} target="_blank" rel="noreferrer"
                                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100">
                                            <ExternalLink className="w-4 h-4" /> Open sheet
                                        </a>
                                    )}
                                    <button onClick={disconnect} disabled={busy === 'disconnect'}
                                        className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 active:scale-95 disabled:opacity-60">
                                        <Power className="w-4 h-4" /> Disconnect
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                <HealthMini label="Local sync" value={status.sync_health?.last_local_success ? timeAgo(status.sync_health.last_local_success) : 'none'} />
                                <HealthMini label="Google sync" value={status.sync_health?.last_google_success ? timeAgo(status.sync_health.last_google_success) : 'none'} />
                                <HealthMini label="Failed syncs" value={status.sync_health?.failed_google_syncs || 0} danger={status.sync_health?.failed_google_syncs > 0} />
                                <HealthMini label="Unsynced rows" value={status.sync_health?.unsynced_rows || 0} danger={isGoogle && status.sync_health?.unsynced_rows > 0} />
                            </div>
                            {status.sync_health?.last_google_error && (
                                <div className="mt-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-xs text-rose-700 flex items-center gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5" /> {status.sync_health.last_google_error}
                                </div>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button onClick={retryFailed} disabled={busy === 'retry' || !isGoogle}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 active:scale-95">
                                    <RefreshCw className={`w-3.5 h-3.5 ${busy === 'retry' ? 'animate-spin' : ''}`} /> Retry failed
                                </button>
                                <button onClick={notifyOverdue} disabled={busy === 'overdue'}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 hover:bg-amber-100 disabled:opacity-50 active:scale-95">
                                    <AlertTriangle className="w-3.5 h-3.5" /> Alert overdue
                                </button>
                            </div>

                            {/* Config row */}
                            <div className="mt-4 pt-4 border-t border-slate-100 grid md:grid-cols-4 gap-3">
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Spreadsheet ID {isGoogle ? '' : '(for Google)'}</label>
                                    <input value={cfg.spreadsheet_id} onChange={e => setCfg({ ...cfg, spreadsheet_id: e.target.value })}
                                        placeholder="1AbC…xyz (from the sheet URL)"
                                        className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 transition" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ledger tab</label>
                                    <input value={cfg.ap_sheet} onChange={e => setCfg({ ...cfg, ap_sheet: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 transition" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Supplier tab</label>
                                    <input value={cfg.supplier_sheet} onChange={e => setCfg({ ...cfg, supplier_sheet: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 transition" />
                                </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={cfg.delete_on_dispute} onChange={e => setCfg({ ...cfg, delete_on_dispute: e.target.checked })} className="accent-rose-600" />
                                    Remove the row when an invoice is disputed <span className="text-slate-400">(default keeps it, marked “Disputed”)</span>
                                </label>
                                <button onClick={saveConfig} disabled={busy === 'config'}
                                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95">
                                    <Settings2 className="w-3.5 h-3.5" /> Save settings
                                </button>
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <Stat label="Payables" value={sm.total} icon={<ScrollText className="w-4 h-4" />} />
                            <Stat label="Outstanding" value={taka(sm.outstanding)} icon={<Banknote className="w-4 h-4" />} wide />
                            <Stat label="Payable" value={sm.payable} tone="amber" />
                            <Stat label="Funded" value={sm.funded} tone="indigo" />
                            <Stat label="Paid" value={sm.paid} tone="emerald" />
                            <Stat label="Disputed" value={sm.disputed} tone="rose" />
                        </div>

                        <AgingBoard aging={status.aging || {}} />

                        {/* Ledger table */}
                        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
                            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-4 h-4 text-slate-400" /> Accounts Payable Ledger</h3>
                                <div className="flex items-center gap-3">
                                    <span className="hidden sm:inline text-xs text-slate-400">{ledger.length} rows · updates live</span>
                                    <button onClick={openCreate}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-sm">
                                        <Plus className="w-3.5 h-3.5" /> Add payable
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-100 bg-slate-900 border-b border-slate-900">
                                            <th className="px-5 py-3">Invoice</th>
                                            <th className="px-3 py-3">Supplier</th>
                                            <th className="px-3 py-3 text-right">Amount</th>
                                            <th className="px-3 py-3 text-right">Early Payout</th>
                                            <th className="px-3 py-3">Due</th>
                                            <th className="px-3 py-3 text-center">Status</th>
                                            <th className="px-3 py-3 text-right">Updated</th>
                                            <th className="px-5 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ledger.map(r => {
                                            const s = statusStyle(r.erp_status);
                                            return (
                                                <tr key={r.invoice_id} className={`border-b border-slate-50 hover:bg-slate-100 transition-colors ${r._changed ? 'bc-row-flash' : ''}`}>
                                                    <td className="px-5 py-3 font-semibold text-slate-800">
                                                        <div className="flex items-center gap-2">
                                                            {r.invoice_number}
                                                            {r.source === 'manual' && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] font-bold uppercase tracking-wider">Manual</span>}
                                                        </div>
                                                        {(r.po_number || r.gl_code || r.department || r.payment_terms) && (
                                                            <p className="text-[11px] font-normal text-slate-400 mt-0.5 truncate max-w-[260px]">
                                                                {[r.po_number && `PO ${r.po_number}`, r.gl_code && `GL ${r.gl_code}`, r.department, r.payment_terms].filter(Boolean).join(' / ')}
                                                            </p>
                                                        )}
                                                        {r.note && <p className="text-[11px] font-normal text-slate-400 mt-0.5 truncate max-w-[220px]">{r.note}</p>}
                                                    </td>
                                                    <td className="px-3 py-3 text-slate-600">{r.supplier_name}</td>
                                                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                                                        {taka(r.amount)}
                                                        {r.tax_amount != null && <p className="text-[10px] text-slate-400">Tax {taka(r.tax_amount)}</p>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right tabular-nums text-slate-500">{taka(r.payout_amount)}</td>
                                                    <td className="px-3 py-3 text-slate-500">{r.due_date || '—'}</td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <div className="w-[90px] flex justify-center">
                                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}></span>{r.erp_status}
                                                                </span>
                                                            </div>
                                                            <SyncBadge isGoogle={isGoogle} row={r} />
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-[11px] text-slate-400 whitespace-nowrap">{timeAgo(r.updated_at)}</td>
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button onClick={() => openEdit(r)} title={r.source === 'manual' ? 'Edit' : 'Edit accounting fields'}
                                                                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {ledger.length === 0 && (
                                            <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400 text-sm">No payables yet. They appear as invoices are confirmed, or add one manually.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Cross-reference + activity log */}
                        <div className="grid lg:grid-cols-2 gap-5 items-start">
                            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                                <div className="bg-slate-900 px-5 py-3.5 border-b border-slate-900 flex items-center justify-between gap-3">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> Supplier cross-reference</h3>
                                    <button onClick={() => api.get('/api/erp/suppliers').then(setSuppliers).catch(() => {})} className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" title="Refresh suppliers">
                                        <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="p-4 sm:p-5 flex-1 flex flex-col">
                                    <p className="text-[11px] text-slate-500 mb-3 font-medium px-2">
                                        {suppliers?.source === 'google'
                                            ? `Checked against ${suppliers.sheetCount} suppliers in your sheet.`
                                            : 'Connect Google Sheets to check these against your own supplier master list.'}
                                    </p>
                                    <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto custom-scrollbar -mx-2 px-2">
                                    {(suppliers?.suppliers || []).map((s, i) => (
                                        <div key={i} className="flex items-center justify-between py-3 px-2 hover:bg-slate-50/50 rounded-lg transition-colors">
                                            <div className="min-w-0">
                                                <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5 text-slate-400" />{s.supplier}</span>
                                                <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[280px]">
                                                    {s.reason}{s.matchedTo ? `: ${s.matchedTo}` : ''}
                                                    {s.healthBand ? ` / Health ${s.healthBand} ${s.healthScore}` : ''}
                                                </p>
                                            </div>
                                            {suppliers?.source === 'google' ? (
                                                s.matchStatus === 'exact'
                                                    ? <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Exact</span>
                                                    : s.matchStatus === 'fuzzy'
                                                        ? <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Fuzzy</span>
                                                        : <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Missing</span>
                                            ) : <span className="text-[10px] text-slate-400">—</span>}
                                        </div>
                                    ))}
                                    {suppliers?.sheetDuplicates?.length > 0 && (
                                        <p className="text-[11px] text-amber-600 py-2 px-2">Duplicate supplier names in sheet: {suppliers.sheetDuplicates.slice(0, 3).join(', ')}</p>
                                    )}
                                    {(!suppliers?.suppliers || suppliers.suppliers.length === 0) && <p className="text-xs text-slate-400 py-2 px-2">No suppliers invoicing you yet.</p>}
                                </div>
                                </div>
                            </div>

                            <ReconciliationPanel
                                reconciliation={reconciliation}
                                busy={busy}
                                onRefresh={() => api.get('/api/erp/reconciliation').then(setReconciliation).catch(() => {})}
                                onNotify={notifyReconciliation}
                            />

                            <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                                <div className="bg-slate-900 px-5 py-3.5 border-b border-slate-900">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /> Sync activity</h3>
                                </div>
                                <div className="p-4 sm:p-5 flex-1">
                                    <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto custom-scrollbar -mx-2 px-2">
                                    {log.map(l => (
                                        <div key={l.id} className="flex items-start gap-3 py-3 px-2 text-xs hover:bg-slate-50/50 rounded-lg transition-colors">
                                            <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 shadow-sm ${l.status === 'success' ? 'bg-emerald-500 shadow-emerald-500/20' : l.status === 'failed' ? 'bg-rose-500 shadow-rose-500/20' : 'bg-slate-300'}`}></div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-slate-800 leading-relaxed">
                                                    <span className="font-semibold capitalize">{l.action}</span>
                                                    {l.invoice_number && <span className="text-slate-500 font-medium"> · {l.invoice_number}</span>}
                                                    {l.erp_status && <span className="text-slate-400"> → {l.erp_status}</span>}
                                                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${l.target === 'google' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>{l.target}</span>
                                                </p>
                                                {l.detail && <p className="text-[11px] text-slate-500 mt-0.5">{l.detail}</p>}
                                            </div>
                                            <span className="text-[10px] font-semibold text-slate-400 shrink-0 tabular-nums">{timeAgo(l.created_at)}</span>
                                        </div>
                                    ))}
                                    {log.length === 0 && <p className="text-xs text-slate-400 py-2">No activity yet.</p>}
                                </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
            {/* Create / edit payable modal */}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 bc-pop">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                {modal.mode === 'create' ? <Plus className="w-4 h-4 text-emerald-600" /> : <Pencil className="w-4 h-4 text-slate-500" />}
                                {modal.mode === 'create' ? 'Add a payable' : (modal.source === 'manual' ? 'Edit payable' : 'Edit accounting fields')}
                            </h2>
                            <button onClick={() => setModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                        </div>
                        <p className="text-xs text-slate-500 mb-5">
                            {modal.mode === 'create' ? 'Track a bill that did not come through the platform. It joins the ledger (and your sheet, if connected).'
                                : modal.source === 'manual' ? 'Update this manual payable.' : 'Platform invoice values stay locked; accounting metadata can be added here.'}
                        </p>
                        {(() => {
                            const coreReadonly = modal.mode === 'edit' && modal.source !== 'manual';
                            const field = (label, key, props = {}, disabled = coreReadonly) => (
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
                                    <input {...props} value={form[key]} disabled={disabled} onChange={e => setForm({ ...form, [key]: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 disabled:bg-slate-50 disabled:text-slate-400 transition" />
                                </div>
                            );
                            return (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        {field('Invoice / reference', 'invoice_number', { placeholder: 'auto if blank' })}
                                        {field('Supplier', 'supplier_name', { placeholder: 'Supplier name' })}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {field('Amount (৳)', 'amount', { type: 'number', min: '0', placeholder: '0' })}
                                        {field('Tax/VAT', 'tax_amount', { type: 'number', min: '0', placeholder: '0' }, false)}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {field('Due date', 'due_date', { type: 'date' })}
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</label>
                                        <select value={form.erp_status} disabled={coreReadonly} onChange={e => setForm({ ...form, erp_status: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 disabled:bg-slate-50 disabled:text-slate-400 transition">
                                            {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {field('PO number', 'po_number', { placeholder: 'Optional' }, false)}
                                        {field('GL / category', 'gl_code', { placeholder: 'Optional' }, false)}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {field('Department', 'department', { placeholder: 'Optional' }, false)}
                                        {field('Payment terms', 'payment_terms', { placeholder: 'Net 30' }, false)}
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Note</label>
                                        <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Optional"
                                            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 transition" />
                                    </div>
                                </div>
                            );
                        })()}
                        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
                            <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                            <button onClick={saveRow} disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-60 transition">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                {modal.mode === 'create' ? 'Add payable' : 'Save changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes bcRowFlash { 0% { background-color: rgba(16,185,129,0.18); } 100% { background-color: transparent; } }
                .bc-row-flash { animation: bcRowFlash 2s ease-out; }
                @keyframes bcPop { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: none; } }
                .bc-pop { animation: bcPop 0.16s ease-out; }
            `}</style>
        </div>
    );
}

function HealthMini({ label, value, danger }) {
    return (
        <div className="rounded-xl border border-[#C6DEF6] bg-[#E6F5FA] px-4 py-2.5 shadow-sm hover:shadow-md transition-shadow duration-300">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5 text-slate-700">{label}</p>
            <p className="text-xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
        </div>
    );
}

function AgingBoard({ aging }) {
    const items = [
        ['Future', aging.future || 0],
        ['Due soon', aging.due_soon || 0],
        ['Due today', aging.due_today || 0],
        ['1-30 overdue', aging.overdue_1_30 || 0],
        ['31-60 overdue', aging.overdue_31_60 || 0],
        ['60+ overdue', aging.overdue_60_plus || 0],
    ];
    return (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /> AP aging</h3>
                <span className="text-xs text-slate-400">Overdue {taka(aging.overdue_amount)}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {items.map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-[#C6DEF6] bg-[#E6F5FA] px-4 py-2.5 shadow-sm hover:shadow-md transition-shadow duration-300">
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5 text-slate-700">{label}</p>
                        <p className="text-xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SyncBadge({ isGoogle, row }) {
    if (!isGoogle) return <Database className="w-3.5 h-3.5 text-slate-400 -mt-[1px]" title="Local" />;
    if (row.synced_to_google) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 -mt-[1px]" title="Synced" />;
    return <Clock className="w-3.5 h-3.5 text-amber-500 -mt-[1px]" title="Pending sync" />;
}

function ReconciliationPanel({ reconciliation, busy, onRefresh, onNotify }) {
    const issues = reconciliation?.issues || [];
    const counts = reconciliation?.counts || {};
    return (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="bg-slate-900 px-5 py-3.5 flex items-center justify-between gap-3 border-b border-slate-900">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-slate-400" /> Reconciliation</h3>
                <div className="flex items-center gap-2">
                    <button onClick={onRefresh} className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" title="Refresh reconciliation">
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={onNotify} disabled={busy === 'reconNotify' || issues.length === 0}
                        className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-yellow-950 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 transition-colors shadow-sm">
                        Notify
                    </button>
                </div>
            </div>
            <div className="p-5 flex-1">
                <div className="flex items-center gap-2 mb-4">
                {[
                    { label: 'Missing', count: counts.missing, danger: (counts.missing || 0) > 0 },
                    { label: 'Mismatched', count: counts.mismatched, danger: (counts.mismatched || 0) > 0 },
                    { label: 'Extra', count: counts.extra, danger: (counts.extra || 0) > 0 }
                ].map(stat => (
                    <div key={stat.label} className={`flex-1 flex items-center justify-between px-4 py-2.5 rounded-xl border ${stat.danger ? 'bg-rose-50 border-rose-200' : 'bg-[#E6F5FA] border-[#C6DEF6]'}`}>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${stat.danger ? 'text-rose-600' : 'text-slate-600'}`}>{stat.label}</span>
                        <span className={`text-lg font-bold tabular-nums ${stat.danger ? 'text-rose-700' : 'text-slate-900'}`}>{stat.count || 0}</span>
                    </div>
                ))}
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {issues.slice(0, 6).map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${issue.severity === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`}></span>
                        <div>
                            <p className="font-semibold text-slate-700">{issue.invoice_number || `Sheet row ${issue.rowNumber || '-'}`}</p>
                            <p className="text-slate-400">{issue.detail}</p>
                        </div>
                    </div>
                ))}
                {issues.length === 0 && <p className="text-xs text-slate-400">{reconciliation?.message || 'No reconciliation issues.'}</p>}
            </div>
            </div>
        </div>
    );
}

function Stat({ label, value, icon, tone, wide }) {
    return (
        <div className="rounded-xl border border-[#C6DEF6] bg-[#E6F5FA] p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">{icon}{label}</p>
            <p className={`mt-1 font-bold tabular-nums tracking-tight ${wide ? 'text-lg' : 'text-2xl'} text-slate-900`}>{value ?? 0}</p>
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import {
    Wallet, TrendingUp, CheckCircle2, Layers, Landmark,
    Calendar, AlertTriangle, ChevronRight, Sun, Moon, Activity, ArrowUpRight
} from 'lucide-react';

export default function Portfolio() {
    const [funders, setFunders] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [portfolio, setPortfolio] = useState(null);
    const [tab, setTab] = useState('active');
    const [loading, setLoading] = useState(true);
    // Theme is local to this page; default dark to match the premium look.
    const [dark, setDark] = useState(() => localStorage.getItem('portfolioTheme') !== 'light');

    function toggleTheme() {
        setDark(prev => {
            localStorage.setItem('portfolioTheme', !prev ? 'dark' : 'light');
            return !prev;
        });
    }

    useEffect(() => {
        fetch('/api/portfolio/funders')
            .then(r => r.json())
            .then(data => {
                setFunders(data);
                if (data.length > 0) setSelectedId(String(data[0].funderId));
                else setLoading(false);
            })
            .catch(e => { console.error(e); setLoading(false); });
    }, []);

    useEffect(() => {
        if (!selectedId) return;
        setLoading(true);
        fetch('/api/portfolio/funders/' + selectedId)
            .then(r => r.json())
            .then(data => { setPortfolio(data); setLoading(false); })
            .catch(e => { console.error(e); setLoading(false); });
    }, [selectedId]);

    function money(n) { return '৳ ' + Number(n || 0).toLocaleString(); }
    function moneyShort(n) {
        n = Number(n || 0);
        if (n >= 10000000) return '৳' + (n / 10000000).toFixed(2) + 'Cr';
        if (n >= 100000) return '৳' + (n / 100000).toFixed(1) + 'L';
        return '৳' + n.toLocaleString();
    }
    function daysToMaturity(d) {
        return Math.round((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }

    // Theme tokens.
    const t = dark ? {
        page: 'bg-[#0a0e0d] absolute inset-0 p-4 lg:p-6 flex flex-col overflow-hidden z-10',
        card: 'bg-[#121613] border border-white/5',
        h1: 'text-white', sub: 'text-slate-400', muted: 'text-slate-500',
        thead: 'text-slate-500', rowHover: 'hover:bg-white/[0.03]', divider: 'border-white/5',
        input: 'bg-[#121613] border-white/10 text-white', toggle: 'bg-[#121613] border-white/10 text-amber-400',
        track: '#1e2621'
    } : {
        page: 'bg-slate-50 absolute inset-0 p-4 lg:p-6 flex flex-col overflow-hidden z-10',
        card: 'bg-white border border-slate-200/80', h1: 'text-slate-900', sub: 'text-slate-500', muted: 'text-slate-400',
        thead: 'text-slate-400', rowHover: 'hover:bg-slate-50', divider: 'border-slate-100',
        input: 'bg-white border-slate-200 text-slate-800', toggle: 'bg-white border-slate-200 text-slate-600',
        track: '#eef2f0'
    };

    if (loading && !portfolio) {
        return (
            <div className={t.page}>
                <div className="p-10 flex items-center justify-center min-h-[400px]">
                    <div className={`flex flex-col items-center ${t.muted}`}>
                        <Activity className="w-7 h-7 animate-pulse mb-3" />
                        <p className="text-sm font-medium">Loading portfolio...</p>
                    </div>
                </div>
            </div>
        );
    }

    const p = portfolio || {};
    const rows = tab === 'active' ? (p.active || [])
        : tab === 'matured' ? (p.matured || [])
        : tab === 'overdue' ? (p.overdue || [])
        : (p.completed || []);

    // Real capital-allocation donut: principal split across the four buckets.
    const sumPrincipal = (arr) => (arr || []).reduce((s, r) => s + r.principal, 0);
    const activeCap = sumPrincipal(p.active);
    const maturedCap = sumPrincipal(p.matured);
    const overdueCap = sumPrincipal(p.overdue);
    const completedCap = sumPrincipal(p.completed);
    const segments = [
        { label: 'Active', value: activeCap, color: '#10b981' },
        { label: 'Matured', value: maturedCap, color: '#f59e0b' },
        { label: 'Overdue', value: overdueCap, color: '#f43f5e' },
        { label: 'Completed', value: completedCap, color: '#38bdf8' }
    ].filter(s => s.value > 0);

    return (
        <div className={t.page}>
            <div className="max-w-[1400px] w-full h-full mx-auto flex flex-col gap-4">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className={`text-2xl font-bold tracking-tight ${t.h1}`}>Investor Portfolio</h1>
                        <p className={`mt-1 text-sm ${t.sub}`}>Deployed capital, expected and realized returns, and maturity schedule &mdash; from real transaction events.</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <button onClick={toggleTheme} className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm transition-all active:scale-95 ${t.toggle}`} title={dark ? 'Switch to light' : 'Switch to dark'}>
                            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        <div className="relative">
                            <Landmark className={`w-4 h-4 ${t.muted} absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none`} />
                            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={`appearance-none pl-10 pr-9 py-2.5 rounded-xl border text-sm font-semibold shadow-sm focus:outline-none cursor-pointer ${t.input}`}>
                                {funders.map(f => <option key={f.funderId} value={f.funderId}>{f.funderName}</option>)}
                            </select>
                            <ChevronRight className={`w-4 h-4 ${t.muted} absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none`} />
                        </div>
                    </div>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Kpi dark={dark} icon={<Wallet className="w-4 h-4" />} label="Deployed Capital" value={money(p.deployedCapital)} badge={`${p.activeCount || 0} active`} sub={`${p.overdueCount || 0} overdue`} />
                    <Kpi dark={dark} icon={<TrendingUp className="w-4 h-4" />} label="Projected Return" value={money(p.projectedReturn)} badge={`${p.projectedAnnualRate || 0}% annual`} sub="on deployed capital" />
                    <Kpi dark={dark} icon={<CheckCircle2 className="w-4 h-4" />} label="Realized Return" value={money(p.realizedReturn)} badge={`${p.realizedAnnualRate || 0}% annual`} sub={`${p.completedCount || 0} completed`} />
                    <Kpi dark={dark} icon={<Layers className="w-4 h-4" />} label="Total Invested" value={money(p.totalInvested)} badge={`${p.totalInvestments || 0} deals`} sub="lifetime capital" />
                </div>

                {/* Middle and Bottom: Table (Left) + Donut & Returns (Right) */}
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Left Column: Investments Table */}
                    <div className={`lg:col-span-2 ${t.card} rounded-xl shadow-sm flex flex-col min-h-0`}>
                        <div className={`flex items-center gap-1 px-4 pt-3 border-b ${t.divider}`}>
                            <Tab dark={dark} active={tab === 'active'} onClick={() => setTab('active')} label="Active" count={p.activeCount} />
                            <Tab dark={dark} active={tab === 'matured'} onClick={() => setTab('matured')} label="Matured" count={p.maturedCount} />
                            <Tab dark={dark} active={tab === 'overdue'} onClick={() => setTab('overdue')} label="Overdue" count={p.overdueCount} />
                            <Tab dark={dark} active={tab === 'completed'} onClick={() => setTab('completed')} label="Completed" count={p.completedCount} />
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className={`${t.thead} text-[11px] font-bold uppercase tracking-wider`}>
                                        <th className="text-left font-bold px-6 py-3">Buyer</th>
                                        <th className="text-right font-bold px-6 py-3">Principal</th>
                                        <th className="text-right font-bold px-6 py-3">{tab === 'completed' ? 'Realized' : 'Expected'}</th>
                                        <th className="text-right font-bold px-6 py-3">Rate</th>
                                        <th className="text-right font-bold px-6 py-3">Maturity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.invoiceId} className={`border-t ${t.divider} ${t.rowHover}`}>
                                            <td className={`px-6 py-3.5 font-semibold ${t.h1}`}>{r.buyerName || 'Unknown Buyer'}</td>
                                            <td className={`px-6 py-3.5 text-right ${t.sub}`}>{money(r.principal)}</td>
                                            <td className="px-6 py-3.5 text-right font-semibold text-emerald-500">+{money(r.expectedReturn)}</td>
                                            <td className={`px-6 py-3.5 text-right ${t.sub}`}>{r.annualRate}%</td>
                                            <td className={`px-6 py-3.5 text-right ${t.muted}`}>{new Date(r.dueDate).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                    {rows.length === 0 && <tr><td colSpan="5" className={`px-6 py-10 text-center text-sm ${t.muted}`}>No {tab} investments.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right Column: Donut + Returns Hero */}
                    <div className="flex flex-col justify-between gap-4 min-h-0">
                    {/* Capital allocation donut */}
                    <div className={`${t.card} rounded-xl shadow-sm p-4 lg:p-5 flex flex-col shrink-0`}>
                        <h2 className={`text-sm font-bold ${t.h1}`}>Capital Allocation</h2>
                        <p className={`text-[11px] ${t.muted} mb-2`}>Principal across states</p>
                        <div className="flex flex-row items-center justify-between gap-4">
                            <div className="shrink-0 flex items-center justify-center">
                                <Donut segments={segments} track={t.track} centerValue={moneyShort(p.totalInvested)} centerLabel="invested" dark={dark} />
                            </div>
                            <div className="flex-1 flex flex-col justify-center space-y-1.5">
                                <Legend color="#10b981" label="Active" value={moneyShort(activeCap)} dark={dark} />
                                <Legend color="#f59e0b" label="Matured" value={moneyShort(maturedCap)} dark={dark} />
                                <Legend color="#f43f5e" label="Overdue" value={moneyShort(overdueCap)} dark={dark} />
                                <Legend color="#38bdf8" label="Completed" value={moneyShort(completedCap)} dark={dark} />
                            </div>
                        </div>
                    </div>

                        {/* Returns hero */}
                        <div className="shrink-0 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-xl p-4 shadow-sm text-white flex flex-row items-center justify-between text-center min-h-0">
                            <div className="flex flex-col items-center flex-1">
                                <p className="text-emerald-100/80 text-[10px] font-bold uppercase tracking-wider">Projected</p>
                                <div className="flex items-end gap-1 mt-1">
                                    <span className="text-2xl lg:text-3xl font-bold">{p.projectedAnnualRate || 0}%</span>
                                    <ArrowUpRight className="w-4 h-4 lg:w-5 lg:h-5 mb-1 text-emerald-300" />
                                </div>
                                <p className="text-emerald-100/70 text-[10px] lg:text-[11px] mt-1 leading-tight">on {moneyShort(p.deployedCapital)}</p>
                            </div>
                            
                            <div className="w-px h-12 bg-white/20 mx-1"></div>
                            
                            <div className="flex flex-col items-center flex-1">
                                <p className="text-emerald-100/80 text-[10px] font-bold uppercase tracking-wider">Realized</p>
                                <div className="flex items-end gap-1 mt-1">
                                    <span className="text-2xl lg:text-3xl font-bold">{p.realizedAnnualRate || 0}%</span>
                                </div>
                                <p className="text-emerald-100/70 text-[10px] lg:text-[11px] mt-1 leading-tight">from {p.completedCount || 0} deals</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Real SVG donut (no chart library).
function Donut({ segments, track, centerValue, centerLabel, dark }) {
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    let cumulative = 0;
    return (
        <div className="relative w-32 h-32">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke={track} strokeWidth="3.4" />
                {segments.map((seg, i) => {
                    const pct = (seg.value / total) * 100;
                    const el = (
                        <circle key={i} cx="18" cy="18" r="15.9155" fill="none" stroke={seg.color} strokeWidth="3.4"
                            strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-cumulative} />
                    );
                    cumulative += pct;
                    return el;
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-lg font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>{centerValue}</span>
                <span className={`text-[9px] uppercase tracking-wider ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{centerLabel}</span>
            </div>
        </div>
    );
}

function Legend({ color, label, value, dark }) {
    return (
        <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-medium" style={{ color: dark ? '#cbd5e1' : '#475569' }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }}></span>{label}
            </span>
            <span className={`text-xs font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>{value}</span>
        </div>
    );
}

function Kpi({ icon, label, value, badge, sub, dark }) {
    const card = dark ? 'bg-[#121613] border border-white/5' : 'bg-white border border-slate-200/80';
    return (
        <div className={`${card} rounded-xl shadow-sm p-4`}>
            <div className="flex items-center justify-between mb-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${dark ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-600'}`}>{icon}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${dark ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>{badge}</span>
            </div>
            <p className={`text-[11px] font-bold uppercase tracking-wider ${dark ? 'text-slate-400' : 'text-slate-400'}`}>{label}</p>
            <p className={`text-2xl font-bold mt-1 ${dark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
            <p className={`text-[11px] mt-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</p>
        </div>
    );
}

function Tab({ active, onClick, label, count, dark }) {
    const activeCls = 'border-emerald-500 text-emerald-500';
    const inactiveCls = dark ? 'border-transparent text-slate-400 hover:text-white' : 'border-transparent text-slate-500 hover:text-slate-800';
    const pill = active ? (dark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600') : (dark ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500');
    return (
        <button onClick={onClick} className={`px-4 py-2 text-[13px] font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${active ? activeCls : inactiveCls}`}>
            {label}<span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${pill}`}>{count || 0}</span>
        </button>
    );
}

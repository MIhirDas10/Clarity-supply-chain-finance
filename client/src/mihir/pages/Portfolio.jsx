import React, { useState, useEffect } from 'react';
import {
    Wallet, TrendingUp, CheckCircle2, Layers, Landmark,
    Calendar, AlertTriangle, ChevronRight, Sun, Moon, Activity, ArrowUpRight,
    StickyNote, Target, Plus, Trash2, Flag, X, Calculator, ShieldAlert, Zap, TrendingDown
} from 'lucide-react';
import {
    getFunderPortfolio, setFunderTarget,
    getPortfolioNotes, createPortfolioNote, updatePortfolioNote, deletePortfolioNote,
    runReturnCalculator, authHeaders,
    getStressScenarios, createStressScenario, deleteStressScenario, runStressTest, getStressRuns
} from '../services/api';

export default function Portfolio() {
    const [funders, setFunders] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [portfolio, setPortfolio] = useState(null);
    const [tab, setTab] = useState('active');
    const [loading, setLoading] = useState(true);
    // Theme is local to this page; default dark to match the premium look.
    const [dark, setDark] = useState(() => localStorage.getItem('portfolioTheme') !== 'light');

    // Investment Notes & Return Target panel (slide-over; page is unchanged when closed).
    const [panelOpen, setPanelOpen] = useState(false);
    const [notes, setNotes] = useState([]);
    const [noteText, setNoteText] = useState('');
    const [noteFlag, setNoteFlag] = useState(false);
    const [targetInput, setTargetInput] = useState('');
    const [savingTarget, setSavingTarget] = useState(false);

    // Return Calculator / Deployment Planner.
    const [plannerOpen, setPlannerOpen] = useState(false);
    const [planCapital, setPlanCapital] = useState('1000000');
    const [planMonths, setPlanMonths] = useState('3');
    const [planResult, setPlanResult] = useState(null);
    const [planning, setPlanning] = useState(false);

    async function runPlan() {
        const capital = Number(planCapital);
        const months = Number(planMonths);
        if (!isFinite(capital) || capital <= 0 || !isFinite(months) || months <= 0) return;
        setPlanning(true);
        try {
            const targetRate = portfolio && portfolio.targetRate != null ? portfolio.targetRate : undefined;
            const res = await runReturnCalculator({ capital, months, targetRate });
            setPlanResult(res);
        } catch (e) { console.error(e); }
        setPlanning(false);
    }

    // Portfolio Stress Testing (Feature 3 - Part B).
    const [stressOpen, setStressOpen] = useState(false);
    const [scenarios, setScenarios] = useState([]);
    const [selScenario, setSelScenario] = useState('');
    const [stressResult, setStressResult] = useState(null);
    const [running, setRunning] = useState(false);
    const [stressRuns, setStressRuns] = useState([]);
    const [showNewScenario, setShowNewScenario] = useState(false);
    const [newScenario, setNewScenario] = useState({ name: '', defaultRateShock: '10', tenorExtensionDays: '30', recoveryHaircut: '0.2' });

    function loadStress(fid) {
        getStressScenarios(fid).then(list => {
            setScenarios(list);
            if (list.length && !selScenario) setSelScenario(String(list[0].id));
        }).catch(e => console.error(e));
        getStressRuns(fid).then(setStressRuns).catch(e => console.error(e));
    }

    async function doRunStress() {
        if (!selectedId || !selScenario) return;
        setRunning(true);
        try {
            const res = await runStressTest(selectedId, Number(selScenario));
            setStressResult(res);
            getStressRuns(selectedId).then(setStressRuns).catch(() => {});
        } catch (e) { console.error(e); }
        setRunning(false);
    }

    async function addScenario() {
        if (!newScenario.name.trim()) return;
        try {
            const created = await createStressScenario({
                funderId: selectedId,
                name: newScenario.name.trim(),
                defaultRateShock: Number(newScenario.defaultRateShock),
                tenorExtensionDays: Number(newScenario.tenorExtensionDays),
                recoveryHaircut: Number(newScenario.recoveryHaircut)
            });
            setShowNewScenario(false);
            setNewScenario({ name: '', defaultRateShock: '10', tenorExtensionDays: '30', recoveryHaircut: '0.2' });
            getStressScenarios(selectedId).then(list => { setScenarios(list); setSelScenario(String(created.id)); });
        } catch (e) { console.error(e); }
    }

    async function removeScenario(id) {
        try {
            await deleteStressScenario(id);
            getStressScenarios(selectedId).then(setScenarios);
            if (String(id) === selScenario) { setSelScenario(''); setStressResult(null); }
        } catch (e) { console.error(e); }
    }

    // Reload the notes list for the selected funder.
    function reloadNotes(fid) {
        if (!fid) return;
        getPortfolioNotes({ funder: fid }).then(setNotes).catch(e => console.error(e));
    }

    async function addNote() {
        if (!noteText.trim() || !selectedId) return;
        try {
            await createPortfolioNote({ funderId: selectedId, note: noteText.trim(), flagged: noteFlag });
            setNoteText(''); setNoteFlag(false);
            reloadNotes(selectedId);
        } catch (e) { console.error(e); }
    }

    async function toggleFlag(n) {
        try { await updatePortfolioNote(n.id, { flagged: !n.flagged }); reloadNotes(selectedId); }
        catch (e) { console.error(e); }
    }

    async function removeNote(id) {
        try { await deletePortfolioNote(id); reloadNotes(selectedId); }
        catch (e) { console.error(e); }
    }

    async function saveTarget() {
        const rate = Number(targetInput);
        if (!isFinite(rate) || rate < 0 || rate > 100 || !selectedId) return;
        setSavingTarget(true);
        try {
            await setFunderTarget(selectedId, rate);
            const fresh = await getFunderPortfolio(selectedId);
            setPortfolio(fresh);
        } catch (e) { console.error(e); }
        setSavingTarget(false);
    }

    function toggleTheme() {
        setDark(prev => {
            localStorage.setItem('portfolioTheme', !prev ? 'dark' : 'light');
            return !prev;
        });
    }

    useEffect(() => {
        fetch('/api/portfolio/funders', { headers: authHeaders() })
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
        fetch('/api/portfolio/funders/' + selectedId, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => {
                setPortfolio(data);
                setTargetInput(data.targetRate != null ? String(data.targetRate) : '');
                setLoading(false);
            })
            .catch(e => { console.error(e); setLoading(false); });
        reloadNotes(selectedId);
        setStressResult(null); setSelScenario('');
        loadStress(selectedId);
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
                        <h1 className={`text-2xl font-bold tracking-tight ${t.h1}`}>Dashboard</h1>
                        <p className={`mt-1 text-sm ${t.sub}`}>Deployed capital, expected and realized returns, and maturity schedule &mdash; from real transaction events.</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <button onClick={() => setStressOpen(true)} className={`group h-10 pl-2 pr-3.5 rounded-xl border flex items-center gap-2 shadow-sm transition-all active:scale-95 hover:border-rose-500/50 ${t.toggle}`} title="Portfolio stress test">
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center bg-rose-500/10 text-rose-500 transition-colors group-hover:bg-rose-500/20">
                                <ShieldAlert className="w-3.5 h-3.5" />
                            </span>
                            <span className={`text-sm font-semibold whitespace-nowrap ${t.h1}`}>Stress Test</span>
                        </button>
                        <button onClick={() => setPlannerOpen(true)} className={`group h-10 pl-2 pr-3.5 rounded-xl border flex items-center gap-2 shadow-sm transition-all active:scale-95 hover:border-emerald-500/50 ${t.toggle}`} title="Return calculator">
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 transition-colors group-hover:bg-emerald-500/20">
                                <Calculator className="w-3.5 h-3.5" />
                            </span>
                            <span className={`text-sm font-semibold whitespace-nowrap ${t.h1}`}>Planner</span>
                        </button>
                        <button onClick={() => setPanelOpen(true)} className={`group h-10 pl-2 pr-3.5 rounded-xl border flex items-center gap-2 shadow-sm transition-all active:scale-95 hover:border-emerald-500/50 ${t.toggle}`} title="Notes & return target">
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 transition-colors group-hover:bg-emerald-500/20">
                                <StickyNote className="w-3.5 h-3.5" />
                            </span>
                            <span className={`text-sm font-semibold whitespace-nowrap ${t.h1}`}>Notes &amp; Target</span>
                            {notes.length > 0 && (
                                <span className="ml-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold leading-none">{notes.length}</span>
                            )}
                        </button>
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

                {/* Risk-adjusted strip: expected loss + risk-adjusted return + concentration (from buyer credit scores) */}
                {p.risk && (
                    <div className={`${t.card} rounded-xl shadow-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6`}>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-rose-500/10 text-rose-500"><AlertTriangle className="w-3.5 h-3.5" /></span>
                            <span className={`text-[11px] font-bold uppercase tracking-wider ${t.sub}`}>Risk-Adjusted</span>
                        </div>
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <RiskStat t={t} label="Expected Loss" value={money(p.risk.expectedLoss)} sub={`${p.risk.expectedLossRate}% of capital`} tone="rose" />
                            <RiskStat t={t} label="Risk-Adj. Return" value={money(p.risk.riskAdjustedReturn)} sub={`vs ${money(p.projectedReturn)} raw`} tone="emerald" />
                            <RiskStat t={t} label="Risk-Adj. Rate" value={`${p.risk.riskAdjustedAnnualRate}%`} sub={`vs ${p.projectedAnnualRate}% raw`} tone="emerald" />
                            <RiskStat t={t} label="Concentration"
                                value={p.risk.concentration.status}
                                sub={`HHI ${p.risk.concentration.hhi} · top ${p.risk.concentration.topBuyerPct}%`}
                                tone={p.risk.concentration.status === 'Concentrated' ? 'rose' : p.risk.concentration.status === 'Moderate' ? 'amber' : 'emerald'} />
                        </div>
                    </div>
                )}

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

            {/* Portfolio Stress Testing slide-over (Feature 3 - Part B) */}
            {stressOpen && (
                <div className="absolute inset-0 z-30 flex justify-end">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setStressOpen(false)}></div>
                    <div className={`relative w-full max-w-lg h-full ${dark ? 'bg-[#0f1412]' : 'bg-white'} shadow-2xl flex flex-col`}>
                        <div className={`flex items-center justify-between px-5 py-4 border-b ${t.divider}`}>
                            <h2 className={`text-base font-bold ${t.h1} flex items-center gap-2`}>
                                <ShieldAlert className="w-4 h-4 text-rose-500" /> Portfolio Stress Test
                            </h2>
                            <button onClick={() => setStressOpen(false)} className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:${dark ? 'bg-white/5' : 'bg-slate-100'}`}><X className="w-4 h-4" /></button>
                        </div>

                        <div className="flex-1 overflow-auto p-5 space-y-5">
                            <p className={`text-xs ${t.muted}`}>Simulate an adverse scenario against the capital you currently hold &mdash; it never funds or picks invoices.</p>

                            {/* Scenario picker */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className={`text-xs font-bold uppercase tracking-wider ${t.sub}`}>Scenario</h3>
                                    <button onClick={() => setShowNewScenario(v => !v)} className="text-[11px] font-semibold text-rose-500 flex items-center gap-1">
                                        <Plus className="w-3 h-3" /> {showNewScenario ? 'Cancel' : 'New'}
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {scenarios.map(s => (
                                        <div key={s.id} onClick={() => setSelScenario(String(s.id))}
                                            className={`rounded-xl p-3 border cursor-pointer transition-all ${String(s.id) === selScenario ? 'border-rose-500/60 ring-1 ring-rose-500/30' : t.divider} ${t.card}`}>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-sm font-semibold ${t.h1}`}>{s.name} {s.funder_id == null && <span className={`text-[10px] ${t.muted}`}>· template</span>}</span>
                                                {s.funder_id != null && (
                                                    <button onClick={(e) => { e.stopPropagation(); removeScenario(s.id); }} className={`${t.muted} hover:text-rose-500`}><Trash2 className="w-3.5 h-3.5" /></button>
                                                )}
                                            </div>
                                            <p className={`text-[11px] mt-1 ${t.muted}`}>+{s.default_rate_shock}pp defaults · +{s.tenor_extension_days}d tenor · {Math.round(s.recovery_haircut * 100)}% recovery haircut</p>
                                        </div>
                                    ))}
                                </div>

                                {showNewScenario && (
                                    <div className={`mt-3 rounded-xl p-3 ${t.card} space-y-2`}>
                                        <input value={newScenario.name} onChange={e => setNewScenario(n => ({ ...n, name: e.target.value }))} placeholder="Scenario name"
                                            className={`w-full px-3 py-2 rounded-lg border text-sm ${t.input} focus:outline-none`} />
                                        <div className="grid grid-cols-3 gap-2">
                                            <label className={`text-[10px] font-bold uppercase ${t.muted}`}>+PD pp
                                                <input type="number" value={newScenario.defaultRateShock} onChange={e => setNewScenario(n => ({ ...n, defaultRateShock: e.target.value }))} className={`w-full mt-1 px-2 py-1.5 rounded-lg border text-sm ${t.input} focus:outline-none`} /></label>
                                            <label className={`text-[10px] font-bold uppercase ${t.muted}`}>+Days
                                                <input type="number" value={newScenario.tenorExtensionDays} onChange={e => setNewScenario(n => ({ ...n, tenorExtensionDays: e.target.value }))} className={`w-full mt-1 px-2 py-1.5 rounded-lg border text-sm ${t.input} focus:outline-none`} /></label>
                                            <label className={`text-[10px] font-bold uppercase ${t.muted}`}>Haircut
                                                <input type="number" step="0.05" value={newScenario.recoveryHaircut} onChange={e => setNewScenario(n => ({ ...n, recoveryHaircut: e.target.value }))} className={`w-full mt-1 px-2 py-1.5 rounded-lg border text-sm ${t.input} focus:outline-none`} /></label>
                                        </div>
                                        <button onClick={addScenario} disabled={!newScenario.name.trim()} className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">Save scenario</button>
                                    </div>
                                )}
                            </div>

                            <button onClick={doRunStress} disabled={running || !selScenario}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-60">
                                <Zap className="w-4 h-4" /> {running ? 'Running...' : 'Run Stress Test'}
                            </button>

                            {/* Result */}
                            {stressResult && (
                                <div className="space-y-3">
                                    <div className={`rounded-xl p-4 ${stressResult.survives ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
                                        <div className="flex items-center gap-2">
                                            {stressResult.survives
                                                ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                : <TrendingDown className="w-5 h-5 text-rose-500" />}
                                            <span className={`text-sm font-bold ${stressResult.survives ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                {stressResult.survives ? 'Survives the scenario' : 'Portfolio goes underwater'}
                                            </span>
                                        </div>
                                        <p className={`text-xs mt-1.5 ${t.sub}`}>Risk-adjusted return {money(stressResult.baseline.riskAdjustedReturn)} → <b className={stressResult.survives ? 'text-emerald-500' : 'text-rose-500'}>{money(stressResult.stressed.riskAdjustedReturn)}</b> ({stressResult.returnErosionPct}% erosion)</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <PlanStat dark={dark} t={t} label="Expected Loss (base)" value={money(stressResult.baseline.expectedLoss)} />
                                        <PlanStat dark={dark} t={t} label="Expected Loss (stressed)" value={money(stressResult.stressed.expectedLoss)} accent />
                                    </div>
                                    <div>
                                        <h4 className={`text-[11px] font-bold uppercase tracking-wider ${t.sub} mb-2`}>Worst-hit holdings</h4>
                                        <div className="space-y-1.5">
                                            {stressResult.topContributors.map((c, i) => (
                                                <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 ${t.card}`}>
                                                    <div>
                                                        <p className={`text-sm font-semibold ${t.h1}`}>{c.buyerName}</p>
                                                        <p className={`text-[10px] ${t.muted}`}>PD {c.basePd}% → {c.stressedPd}%</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-bold text-rose-500">+{money(c.lossIncrease)}</p>
                                                        <p className={`text-[10px] ${t.muted}`}>{money(c.baseLoss)} → {money(c.stressedLoss)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Run history */}
                            {stressRuns.length > 0 && (
                                <div>
                                    <h4 className={`text-[11px] font-bold uppercase tracking-wider ${t.sub} mb-2`}>Recent runs</h4>
                                    <div className="space-y-1.5">
                                        {stressRuns.slice(0, 6).map(r => (
                                            <div key={r.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${t.card}`}>
                                                <span className={`text-xs font-medium ${t.h1}`}>{r.scenario_name}</span>
                                                <span className={`text-[11px] font-bold ${r.survives ? 'text-emerald-500' : 'text-rose-500'}`}>{r.survives ? 'Survives' : 'Fails'} · {money(r.stressed_risk_adjusted)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Return Calculator / Deployment Planner modal */}
            {plannerOpen && (
                <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPlannerOpen(false)}></div>
                    <div className={`relative w-full max-w-lg rounded-2xl shadow-2xl ${dark ? 'bg-[#0f1412] border border-white/10' : 'bg-white'} p-6`}>
                        <div className="flex items-center justify-between mb-1">
                            <h2 className={`text-lg font-bold ${t.h1} flex items-center gap-2`}>
                                <Calculator className="w-4 h-4 text-emerald-500" /> Return Planner
                            </h2>
                            <button onClick={() => setPlannerOpen(false)} className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:${dark ? 'bg-white/5' : 'bg-slate-100'}`}><X className="w-4 h-4" /></button>
                        </div>
                        <p className={`text-xs ${t.muted} mb-5`}>Projects your return against the live marketplace rate &mdash; not stored data.</p>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={`text-[11px] font-bold uppercase tracking-wider ${t.sub}`}>Capital (৳)</label>
                                <input type="number" min="0" step="10000" value={planCapital} onChange={e => setPlanCapital(e.target.value)}
                                    className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm font-semibold ${t.input} focus:outline-none`} />
                            </div>
                            <div>
                                <label className={`text-[11px] font-bold uppercase tracking-wider ${t.sub}`}>Horizon (months)</label>
                                <input type="number" min="1" max="60" value={planMonths} onChange={e => setPlanMonths(e.target.value)}
                                    className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm font-semibold ${t.input} focus:outline-none`} />
                            </div>
                        </div>
                        <button onClick={runPlan} disabled={planning}
                            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-60">
                            <Calculator className="w-4 h-4" /> {planning ? 'Calculating...' : 'Calculate Projection'}
                        </button>

                        {planResult && (
                            <div className="mt-5 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <PlanStat dark={dark} t={t} label="Projected Return" value={money(planResult.projectedReturn)} accent />
                                    <PlanStat dark={dark} t={t} label="Total at Maturity" value={money(planResult.projectedTotal)} />
                                    <PlanStat dark={dark} t={t} label="Marketplace Rate" value={planResult.marketplaceRate + '%'} />
                                    <PlanStat dark={dark} t={t} label="Monthly Income" value={money(planResult.monthlyIncome)} />
                                    <PlanStat dark={dark} t={t} label="Est. Invoices" value={planResult.estInvoices} />
                                    <PlanStat dark={dark} t={t} label="Avg Ticket" value={money(planResult.avgTicket)} />
                                </div>
                                {planResult.meetsTarget !== null && (
                                    <div className={`px-3.5 py-2.5 rounded-xl text-xs font-medium ${planResult.meetsTarget ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                        {planResult.meetsTarget ? 'Meets' : 'Below'} your target &mdash; marketplace {planResult.marketplaceRate}% vs target {portfolio.targetRate}% ({planResult.targetGap > 0 ? '+' : ''}{planResult.targetGap}%)
                                    </div>
                                )}
                                <p className={`text-[11px] ${t.muted}`}>Based on {planResult.sampleSize} funded records at an effective {planResult.effectiveAnnualReturnPct}% annualised.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Slide-over: Return Target + Investment Notes (Feature 3 write side) */}
            {panelOpen && (
                <div className="absolute inset-0 z-30 flex justify-end">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPanelOpen(false)}></div>
                    <div className={`relative w-full max-w-md h-full ${dark ? 'bg-[#0f1412]' : 'bg-white'} shadow-2xl flex flex-col`}>
                        <div className={`flex items-center justify-between px-5 py-4 border-b ${t.divider}`}>
                            <h2 className={`text-base font-bold ${t.h1} flex items-center gap-2`}>
                                <StickyNote className="w-4 h-4 text-emerald-500" /> Notes &amp; Return Target
                            </h2>
                            <button onClick={() => setPanelOpen(false)} className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.muted} hover:${dark ? 'bg-white/5' : 'bg-slate-100'}`}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-5 space-y-6">
                            {/* Return target */}
                            <div className={`${t.card} rounded-xl p-4`}>
                                <h3 className={`text-xs font-bold uppercase tracking-wider ${t.sub} flex items-center gap-1.5 mb-3`}>
                                    <Target className="w-3.5 h-3.5" /> Target Annual Return
                                </h3>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <input type="number" min="0" max="100" step="0.5" value={targetInput}
                                            onChange={(e) => setTargetInput(e.target.value)} placeholder="e.g. 14.5"
                                            className={`w-full pl-3 pr-7 py-2 rounded-lg border text-sm font-semibold ${t.input} focus:outline-none`} />
                                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm ${t.muted}`}>%</span>
                                    </div>
                                    <button onClick={saveTarget} disabled={savingTarget}
                                        className="px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-60">
                                        {savingTarget ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                                {portfolio && portfolio.targetRate != null && (
                                    <p className={`text-xs mt-2.5 ${portfolio.onTarget ? 'text-emerald-500' : 'text-rose-500'} font-medium`}>
                                        Projected {portfolio.projectedAnnualRate}% vs target {portfolio.targetRate}% &middot;{' '}
                                        {portfolio.onTarget ? 'ahead by ' : 'behind by '}
                                        {Math.abs(portfolio.targetGap)}%
                                    </p>
                                )}
                            </div>

                            {/* Add note */}
                            <div>
                                <h3 className={`text-xs font-bold uppercase tracking-wider ${t.sub} mb-3`}>Add Note</h3>
                                <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3}
                                    placeholder="Annotate this funder's portfolio..."
                                    className={`w-full px-3 py-2 rounded-lg border text-sm ${t.input} focus:outline-none resize-none`} />
                                <div className="flex items-center justify-between mt-2">
                                    <button onClick={() => setNoteFlag(v => !v)}
                                        className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${noteFlag ? 'text-rose-500 border-rose-500/40 bg-rose-500/10' : `${t.muted} ${t.divider}`}`}>
                                        <Flag className="w-3.5 h-3.5" /> {noteFlag ? 'Flagged' : 'Flag'}
                                    </button>
                                    <button onClick={addNote} disabled={!noteText.trim()}
                                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 active:scale-95 disabled:opacity-50">
                                        <Plus className="w-3.5 h-3.5" /> Add
                                    </button>
                                </div>
                            </div>

                            {/* Notes list */}
                            <div>
                                <h3 className={`text-xs font-bold uppercase tracking-wider ${t.sub} mb-3`}>Notes ({notes.length})</h3>
                                <div className="space-y-2.5">
                                    {notes.map(n => (
                                        <div key={n.id} className={`${t.card} rounded-xl p-3 flex items-start gap-3`}>
                                            {n.flagged && <Flag className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />}
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm ${t.h1} break-words`}>{n.note}</p>
                                                <p className={`text-[11px] mt-1 ${t.muted}`}>{new Date(n.created_at).toLocaleString()}</p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={() => toggleFlag(n)} title="Toggle flag"
                                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${n.flagged ? 'text-rose-500' : t.muted} hover:${dark ? 'bg-white/5' : 'bg-slate-100'}`}>
                                                    <Flag className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => removeNote(n.id)} title="Delete"
                                                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.muted} hover:text-rose-500 hover:${dark ? 'bg-white/5' : 'bg-slate-100'}`}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {notes.length === 0 && <p className={`text-sm ${t.muted} text-center py-6`}>No notes yet for this funder.</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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

function RiskStat({ label, value, sub, tone, t }) {
    const toneCls = tone === 'rose' ? 'text-rose-500' : tone === 'amber' ? 'text-amber-500' : 'text-emerald-500';
    return (
        <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${t.muted}`}>{label}</p>
            <p className={`text-base font-bold leading-tight ${toneCls}`}>{value}</p>
            <p className={`text-[10px] ${t.muted} leading-tight`}>{sub}</p>
        </div>
    );
}

function PlanStat({ label, value, accent, dark, t }) {
    return (
        <div className={`rounded-xl p-3 ${dark ? 'bg-white/[0.03] border border-white/5' : 'bg-slate-50 border border-slate-100'}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${t.muted}`}>{label}</p>
            <p className={`text-base font-bold mt-0.5 ${accent ? 'text-emerald-500' : t.h1}`}>{value}</p>
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

import React, { useState, useEffect } from 'react';
import {
    Gauge, RefreshCw, ShieldCheck, AlertTriangle, Clock,
    FileCheck2, TrendingUp, History, ChevronRight, Landmark,
    Sliders, Save, MessageSquare, Plus, Trash2, PenLine, X, Lock, Wallet,
    Percent, DollarSign
} from 'lucide-react';
import {
    getCreditConfig, updateCreditConfig,
    getCreditNotes, addCreditNote, deleteCreditNote, overrideCreditScore,
    getCreditExposure, setCreditLimit,
    getCreditPricing, getPricingPolicy, updatePricingPolicy
} from '../services/api';

function ratingStyle(rating) {
    if (rating === 'Excellent') return { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: 'text-emerald-500' };
    if (rating === 'Good') return { badge: 'bg-sky-50 text-sky-700 border-sky-200', ring: 'text-sky-500' };
    if (rating === 'Fair') return { badge: 'bg-amber-50 text-amber-700 border-amber-200', ring: 'text-amber-500' };
    return { badge: 'bg-rose-50 text-rose-700 border-rose-200', ring: 'text-rose-500' };
}

export default function BuyerCredit() {
    const [buyers, setBuyers] = useState([]);
    const [summary, setSummary] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [recalculating, setRecalculating] = useState(false);

    const [configOpen, setConfigOpen] = useState(false);
    const [weights, setWeights] = useState(null);
    const [savingConfig, setSavingConfig] = useState(false);

    const [notes, setNotes] = useState([]);
    const [noteText, setNoteText] = useState('');
    const [overrideScore, setOverrideScore] = useState('');
    const [overrideReason, setOverrideReason] = useState('');
    const [savingOverride, setSavingOverride] = useState(false);

    const [exposure, setExposure] = useState(null);
    const [limitInput, setLimitInput] = useState('');
    const [savingLimit, setSavingLimit] = useState(false);

    const [pricing, setPricing] = useState(null);
    const [priceAmount, setPriceAmount] = useState('100000');
    const [priceTenor, setPriceTenor] = useState('60');

    const [policyOpen, setPolicyOpen] = useState(false);
    const [policy, setPolicy] = useState(null);
    const [savingPolicy, setSavingPolicy] = useState(false);

    function loadExposure(name) {
        getCreditExposure(name)
            .then(data => { setExposure(data); setLimitInput(String(data.creditLimit)); })
            .catch(err => console.error(err));
    }

    function loadPricing(name, amount, tenor) {
        getCreditPricing(name, amount, tenor)
            .then(setPricing)
            .catch(err => console.error(err));
    }

    function openPolicy() {
        getPricingPolicy()
            .then(cfg => { setPolicy(cfg.policy); setPolicyOpen(true); })
            .catch(err => console.error(err));
    }

    function savePolicy() {
        if (!policy) return;
        setSavingPolicy(true);
        updatePricingPolicy(policy)
            .then(() => {
                setSavingPolicy(false);
                setPolicyOpen(false);
                if (expanded) loadPricing(expanded, priceAmount, priceTenor);
            })
            .catch(err => { console.error(err); setSavingPolicy(false); });
    }

    function saveLimit(name, reset) {
        setSavingLimit(true);
        const val = reset ? null : Number(limitInput);
        setCreditLimit(name, val)
            .then(() => { setSavingLimit(false); loadExposure(name); })
            .catch(err => { console.error(err); setSavingLimit(false); });
    }

    function openConfig() {
        getCreditConfig()
            .then(cfg => {
                setWeights({
                    paymentSpeed: Math.round(cfg.weights.paymentSpeed * 100),
                    reliability: Math.round(cfg.weights.reliability * 100),
                    disputeFree: Math.round(cfg.weights.disputeFree * 100),
                    trackRecord: Math.round(cfg.weights.trackRecord * 100)
                });
                setConfigOpen(true);
            })
            .catch(err => console.error(err));
    }

    function saveConfig() {
        if (!weights) return;
        setSavingConfig(true);
        updateCreditConfig({
            paymentSpeed: weights.paymentSpeed / 100,
            reliability: weights.reliability / 100,
            disputeFree: weights.disputeFree / 100,
            trackRecord: weights.trackRecord / 100
        })
            .then(() => { setSavingConfig(false); setConfigOpen(false); loadData(); })
            .catch(err => { console.error(err); setSavingConfig(false); });
    }

    function reloadNotes(name) {
        getCreditNotes(name).then(setNotes).catch(err => console.error(err));
    }

    function addNote(name) {
        if (!noteText.trim()) return;
        addCreditNote(name, noteText.trim())
            .then(() => { setNoteText(''); reloadNotes(name); })
            .catch(err => console.error(err));
    }

    function removeNote(name, id) {
        deleteCreditNote(name, id).then(() => reloadNotes(name)).catch(err => console.error(err));
    }

    function saveOverride(name) {
        const val = overrideScore === '' ? null : Number(overrideScore);
        if (val !== null && (!isFinite(val) || val < 0 || val > 100)) return;
        if (val !== null && !overrideReason.trim()) return;
        setSavingOverride(true);
        overrideCreditScore(name, val, overrideReason.trim())
            .then(() => { setSavingOverride(false); setOverrideReason(''); setOverrideScore(''); loadData(); toggleReload(name); })
            .catch(err => { console.error(err); setSavingOverride(false); });
    }

    function toggleReload(name) {
        fetch('/api/credit/buyers/' + encodeURIComponent(name) + '/history')
            .then(r => r.json()).then(setHistory).catch(err => console.error(err));
    }

    const weightsTotal = weights ? weights.paymentSpeed + weights.reliability + weights.disputeFree + weights.trackRecord : 0;

    function loadData() {
        Promise.all([
            fetch('/api/credit/buyers').then(r => r.json()),
            fetch('/api/credit/summary').then(r => r.json())
        ])
            .then(([buyersData, summaryData]) => {
                setBuyers(buyersData);
                setSummary(summaryData);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }

    useEffect(() => {
        loadData();
    }, []);

    function handleRecalculate() {
        setRecalculating(true);
        fetch('/api/credit/recalculate', { method: 'POST' })
            .then(r => r.json())
            .then(() => {
                loadData();
                setRecalculating(false);
            })
            .catch(err => {
                console.error(err);
                setRecalculating(false);
            });
    }

    function toggle(name) {
        if (expanded === name) {
            setExpanded(null);
            setHistory([]);
            setNotes([]);
            setExposure(null);
            setPricing(null);
            return;
        }
        setExpanded(name);
        setHistory([]);
        setNotes([]);
        setExposure(null);
        setPricing(null);
        setNoteText('');
        setOverrideScore('');
        setOverrideReason('');
        fetch('/api/credit/buyers/' + encodeURIComponent(name) + '/history')
            .then(r => r.json())
            .then(data => setHistory(data))
            .catch(err => console.error(err));
        reloadNotes(name);
        loadExposure(name);
        loadPricing(name, priceAmount, priceTenor);
    }

    const activeBuyer = expanded ? buyers.find(b => b.buyerName === expanded) : null;

    if (loading) {
        return (
            <div className="p-10 flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center text-slate-400">
                    <Gauge className="w-7 h-7 animate-pulse mb-3" />
                    <p className="text-sm font-medium text-slate-500">Loading buyer credit scores...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 lg:p-10 max-w-5xl mx-auto space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <h1 className="text-[26px] font-bold text-slate-900 tracking-tight">Buyer Credit Scores</h1>
                    <p className="text-slate-500 mt-1 text-sm">A weighted, explainable credit score per buyer &mdash; read by pricing and the risk engine.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button
                        onClick={openConfig}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
                    >
                        <Sliders className="w-4 h-4" /> Weights
                    </button>
                    <button
                        onClick={openPolicy}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
                    >
                        <Percent className="w-4 h-4" /> Pricing Model
                    </button>
                    <button
                        onClick={handleRecalculate}
                        disabled={recalculating}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-60 shadow-sm"
                    >
                        <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
                        {recalculating ? 'Recomputing...' : 'Recompute Scores'}
                    </button>
                </div>
            </div>

            {configOpen && weights && (
                <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setConfigOpen(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Sliders className="w-4 h-4 text-slate-500" /> Score Weights</h2>
                            <button onClick={() => setConfigOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                        </div>
                        <p className="text-xs text-slate-500 mb-5">Tune how much each component counts. Saved values are normalised to sum to 100%.</p>
                        <div className="space-y-4">
                            <WeightRow label="Payment Speed" value={weights.paymentSpeed} onChange={v => setWeights(w => ({ ...w, paymentSpeed: v }))} />
                            <WeightRow label="On-Time Reliability" value={weights.reliability} onChange={v => setWeights(w => ({ ...w, reliability: v }))} />
                            <WeightRow label="Dispute-Free Record" value={weights.disputeFree} onChange={v => setWeights(w => ({ ...w, disputeFree: v }))} />
                            <WeightRow label="Track Record" value={weights.trackRecord} onChange={v => setWeights(w => ({ ...w, trackRecord: v }))} />
                        </div>
                        <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                            <span className={`text-xs font-semibold ${weightsTotal === 100 ? 'text-slate-500' : 'text-amber-600'}`}>
                                Total {weightsTotal}% {weightsTotal !== 100 && '(will be normalised)'}
                            </span>
                            <button onClick={saveConfig} disabled={savingConfig || weightsTotal === 0}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-60">
                                <Save className="w-4 h-4" /> {savingConfig ? 'Saving...' : 'Save Weights'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {policyOpen && policy && (
                <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPolicyOpen(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Percent className="w-4 h-4 text-slate-500" /> Risk-Based Pricing Model</h2>
                            <button onClick={() => setPolicyOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                        </div>
                        <p className="text-xs text-slate-500 mb-5">The score maps to a default probability between the floor and ceiling; the rate = cost of capital + risk premium + margin.</p>
                        <div className="space-y-3">
                            <PolicyRow label="Cost of Capital" suffix="% / yr" value={policy.baseRate} onChange={v => setPolicy(p => ({ ...p, baseRate: v }))} step="0.5" />
                            <PolicyRow label="Platform Margin" suffix="% / yr" value={policy.platformMargin} onChange={v => setPolicy(p => ({ ...p, platformMargin: v }))} step="0.5" />
                            <PolicyRow label="Loss Given Default" suffix="(0-1)" value={policy.lgd} onChange={v => setPolicy(p => ({ ...p, lgd: v }))} step="0.05" />
                            <PolicyRow label="PD Floor (best score)" suffix="(0-1)" value={policy.pdFloor} onChange={v => setPolicy(p => ({ ...p, pdFloor: v }))} step="0.01" />
                            <PolicyRow label="PD Ceiling (worst score)" suffix="(0-1)" value={policy.pdCeiling} onChange={v => setPolicy(p => ({ ...p, pdCeiling: v }))} step="0.01" />
                        </div>
                        <div className="flex justify-end mt-5 pt-4 border-t border-slate-100">
                            <button onClick={savePolicy} disabled={savingPolicy}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-60">
                                <Save className="w-4 h-4" /> {savingPolicy ? 'Saving...' : 'Save Model'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    <SummaryCard label="Average Score" value={summary.averageScore} accent="slate" />
                    <SummaryCard label="Excellent / Good" value={summary.excellent + ' / ' + summary.good} accent="emerald" />
                    <SummaryCard label="Fair" value={summary.fair} accent="amber" />
                    <SummaryCard label="Poor" value={summary.poor} accent="rose" />
                </div>
            )}

            <div className="space-y-3.5">
                {buyers.map(buyer => {
                    const s = ratingStyle(buyer.rating);
                    const isOpen = expanded === buyer.buyerName;
                    return (
                        <div key={buyer.buyerName} className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all ${isOpen ? 'border-slate-300 ring-1 ring-slate-200' : 'border-slate-200/80 hover:border-slate-300'}`}>
                            <div className="p-5 flex items-center justify-between cursor-pointer" onClick={() => toggle(buyer.buyerName)}>
                                <div className="flex items-center gap-5">
                                    <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                            <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.5" />
                                            <path className={s.ring} strokeDasharray={`${buyer.score}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                                        </svg>
                                        <span className="absolute text-base font-bold text-slate-800">{buyer.score}</span>
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                                            <Landmark className="w-3.5 h-3.5 text-slate-400" /> {buyer.buyerName}
                                        </h2>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold tracking-wider uppercase ${s.badge}`}>{buyer.rating}</span>
                                            {buyer.overridden && (
                                                <span className="px-2 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700 text-[10px] font-bold tracking-wider uppercase flex items-center gap-1" title={buyer.overrideReason}>
                                                    <Lock className="w-3 h-3" /> Override
                                                </span>
                                            )}
                                            <span className="text-slate-400 text-xs font-medium">{buyer.metrics.totalInvoices} invoices &middot; {buyer.metrics.confirmationCount} confirmed</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-8 text-right">
                                    <MetricMini icon={<Clock className="w-3.5 h-3.5" />} label="Days to Pay" value={buyer.metrics.avgDaysToPay === null ? '-' : buyer.metrics.avgDaysToPay} />
                                    <MetricMini icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Disputes" value={buyer.metrics.disputeCount} />
                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                </div>
                            </div>


                        </div>
                    );
                })}

                {buyers.length === 0 && (
                    <div className="text-center py-12 bg-white border border-slate-200/80 rounded-2xl border-dashed">
                        <Gauge className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm font-medium">No buyer activity to score yet.</p>
                    </div>
                )}

            {/* Buyer Details Modal */}
            {activeBuyer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => toggle(activeBuyer.buyerName)}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-[1000px] my-auto max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0 bg-white z-10">
                            <div className="flex items-center gap-4">
                                <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                        <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.5" />
                                        <path className={ratingStyle(activeBuyer.rating).ring} strokeDasharray={`${activeBuyer.score}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                                    </svg>
                                    <span className="absolute text-sm font-bold text-slate-800">{activeBuyer.score}</span>
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                        <Landmark className="w-5 h-5 text-slate-400" /> {activeBuyer.buyerName}
                                    </h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold tracking-wider uppercase ${ratingStyle(activeBuyer.rating).badge}`}>
                                            {activeBuyer.rating}
                                        </span>
                                        {activeBuyer.overridden && (
                                            <span className="px-2 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700 text-[10px] font-bold tracking-wider uppercase flex items-center gap-1" title={activeBuyer.overrideReason}>
                                                <Lock className="w-3 h-3" /> Override
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => toggle(activeBuyer.buyerName)} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        {/* Modal Body */}
                        <div className="px-8 py-6 md:px-12 md:py-8 overflow-y-auto space-y-10 bg-slate-50/50 flex-1 custom-scrollbar">
                                    <div className="grid md:grid-cols-2 gap-10 md:gap-14 pt-4">
                                        <div>
                                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-4">
                                                <Gauge className="w-3.5 h-3.5" /> Score Breakdown
                                            </h4>
                                            <ComponentBar label="Payment Speed" weight="30%" value={activeBuyer.components.paymentSpeed} icon={<TrendingUp className="w-3.5 h-3.5" />} />
                                            <ComponentBar label="On-Time Reliability" weight="25%" value={activeBuyer.components.reliability} icon={<Clock className="w-3.5 h-3.5" />} />
                                            <ComponentBar label="Dispute-Free Record" weight="25%" value={activeBuyer.components.disputeFree} icon={<ShieldCheck className="w-3.5 h-3.5" />} />
                                            <ComponentBar label="Track Record" weight="20%" value={activeBuyer.components.trackRecord} icon={<FileCheck2 className="w-3.5 h-3.5" />} />
                                            <div className="grid grid-cols-3 gap-2 mt-5">
                                                <Stat label="Confirmed" value={activeBuyer.metrics.confirmationCount} />
                                                <Stat label="Overdue" value={activeBuyer.metrics.overdueCount} />
                                                <Stat label="Financed" value={'৳' + Number(activeBuyer.metrics.financedVolume).toLocaleString()} />
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-4">
                                                <History className="w-3.5 h-3.5" /> Score History
                                            </h4>
                                            {history.length === 0 && (
                                                <p className="text-slate-400 text-xs">No recorded changes yet. Click &ldquo;Recompute Scores&rdquo; to capture a history entry.</p>
                                            )}
                                            <div className="space-y-4">
                                                {history.map((h, idx) => (
                                                    <div key={h.id} className="flex gap-3">
                                                        <div className="flex flex-col items-center">
                                                            <div className={`w-2.5 h-2.5 rounded-full ${idx === 0 ? 'bg-slate-800' : 'bg-slate-300'} mt-1`}></div>
                                                            {idx < history.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1"></div>}
                                                        </div>
                                                        <div className="pb-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-bold text-slate-800">{h.score}</span>
                                                                {h.old_score !== null && (
                                                                    <span className="text-[11px] text-slate-400">from {h.old_score}</span>
                                                                )}
                                                                <span className="text-[11px] text-slate-400">{new Date(h.created_at).toLocaleDateString()}</span>
                                                            </div>
                                                            <p className="text-slate-600 text-xs mt-0.5 leading-relaxed">{h.reason}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-10 md:gap-14">
                                        <div>
                                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-4">
                                                <MessageSquare className="w-3.5 h-3.5" /> Review Notes
                                            </h4>
                                            <div className="flex items-start gap-2 mb-4">
                                                <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2}
                                                    placeholder="Add an analyst note..."
                                                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none resize-none" />
                                                <button onClick={() => addNote(activeBuyer.buyerName)} disabled={!noteText.trim()}
                                                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 active:scale-95 disabled:opacity-50">
                                                    <Plus className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {notes.map(n => (
                                                    <div key={n.id} className="bg-white border border-slate-200/70 rounded-lg p-3 flex items-start gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-slate-700 break-words">{n.note}</p>
                                                            <p className="text-[10px] text-slate-400 mt-1">{n.author} &middot; {new Date(n.created_at).toLocaleDateString()}</p>
                                                        </div>
                                                        <button onClick={() => removeNote(activeBuyer.buyerName, n.id)} title="Delete"
                                                            className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-slate-100 shrink-0">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {notes.length === 0 && <p className="text-slate-400 text-xs">No review notes yet.</p>}
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-4">
                                                <PenLine className="w-3.5 h-3.5" /> Manual Override
                                            </h4>
                                            {activeBuyer.overridden && (
                                                <div className="mb-3 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-700">
                                                    Score pinned at <b>{activeBuyer.score}</b> (computed {activeBuyer.computedScore}). {activeBuyer.overrideReason}
                                                </div>
                                            )}
                                            <div className="space-y-2.5">
                                                <input type="number" min="0" max="100" value={overrideScore}
                                                    onChange={(e) => setOverrideScore(e.target.value)}
                                                    placeholder={activeBuyer.overridden ? 'New score (blank to clear override)' : 'Score 0-100'}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none" />
                                                <input type="text" value={overrideReason}
                                                    onChange={(e) => setOverrideReason(e.target.value)}
                                                    placeholder="Reason (required)"
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none" />
                                                <button onClick={() => saveOverride(activeBuyer.buyerName)} disabled={savingOverride}
                                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:opacity-60">
                                                    <Lock className="w-3.5 h-3.5" />
                                                    {savingOverride ? 'Saving...' : (overrideScore === '' && activeBuyer.overridden ? 'Clear Override' : 'Apply Override')}
                                                </button>
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    A manual override pins the score and is written to the history with your reason. Leave the score blank and apply to clear an existing override.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                <Wallet className="w-3.5 h-3.5" /> Credit Limit &amp; Exposure
                                            </h4>
                                            {exposure && (
                                                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold tracking-wider uppercase ${
                                                    exposure.status === 'Over Limit' ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                    : exposure.status === 'Near Limit' ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                    {exposure.status}
                                                </span>
                                            )}
                                        </div>
                                        {!exposure && <p className="text-slate-400 text-xs">Loading exposure...</p>}
                                        {exposure && (
                                            <div className="grid md:grid-cols-2 gap-6">
                                                <div>
                                                    <div className="flex items-end justify-between mb-1">
                                                        <span className="text-xs font-semibold text-slate-500">Exposure</span>
                                                        <span className="text-xs font-bold text-slate-700">{exposure.utilization}% used</span>
                                                    </div>
                                                    <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                                                        <div className={`h-full rounded-full ${exposure.status === 'Over Limit' ? 'bg-rose-500' : exposure.status === 'Near Limit' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                            style={{ width: Math.min(100, exposure.utilization) + '%' }}></div>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-400">
                                                        <span>৳{Number(exposure.exposure).toLocaleString()} outstanding</span>
                                                        <span>limit ৳{Number(exposure.creditLimit).toLocaleString()}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 mt-4">
                                                        <Stat label="Headroom" value={'৳' + Number(exposure.headroom).toLocaleString()} />
                                                        <Stat label="Open Invoices" value={exposure.outstandingCount} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold text-slate-500 mb-2">
                                                        Set credit limit
                                                        <span className="text-slate-400 font-normal"> &middot; recommended ৳{Number(exposure.recommendedLimit).toLocaleString()} from score {exposure.score}</span>
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <input type="number" min="0" value={limitInput} onChange={e => setLimitInput(e.target.value)}
                                                            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none" />
                                                        <button onClick={() => saveLimit(activeBuyer.buyerName, false)} disabled={savingLimit}
                                                            className="px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 active:scale-95 disabled:opacity-60">
                                                            {savingLimit ? '...' : 'Set'}
                                                        </button>
                                                    </div>
                                                    {exposure.isCustomLimit && (
                                                        <button onClick={() => saveLimit(activeBuyer.buyerName, true)}
                                                            className="mt-2 text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline">
                                                            Reset to score-recommended limit
                                                        </button>
                                                    )}
                                                    <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
                                                        The recommended limit scales with the credit score; exposure is the live total of funded, not-yet-repaid invoices.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                <Percent className="w-3.5 h-3.5" /> Risk-Based Pricing
                                            </h4>
                                            {pricing && (
                                                <span className="text-[11px] font-semibold text-slate-500">
                                                    PD {pricing.pdAnnual}% &middot; LGD {pricing.lgd}
                                                </span>
                                            )}
                                        </div>
                                        {!pricing && <p className="text-slate-400 text-xs">Loading pricing...</p>}
                                        {pricing && (
                                            <div className="grid md:grid-cols-2 gap-6">
                                                <div>
                                                    <div className="flex items-end gap-2">
                                                        <span className="text-3xl font-bold text-indigo-600">{pricing.discountRate}%</span>
                                                        <span className="text-xs text-slate-400 mb-1.5">discount &middot; {pricing.tenorDays}-day tenor</span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        On ৳{Number(pricing.invoiceAmount).toLocaleString()} &rarr; supplier receives{' '}
                                                        <b className="text-slate-800">৳{Number(pricing.supplierPayout).toLocaleString()}</b>
                                                        <span className="text-slate-400"> (fee ৳{Number(pricing.discountAmount).toLocaleString()})</span>
                                                    </p>
                                                    <div className="mt-4 space-y-1.5">
                                                        <RateBar label="Cost of capital" value={pricing.baseRate} total={pricing.annualRate} color="bg-slate-400" />
                                                        <RateBar label="Risk premium (PDxLGD)" value={pricing.riskPremium} total={pricing.annualRate} color="bg-rose-500" />
                                                        <RateBar label="Platform margin" value={pricing.platformMargin} total={pricing.annualRate} color="bg-indigo-500" />
                                                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                                                            <span className="text-xs font-bold text-slate-700">Annualised rate</span>
                                                            <span className="text-xs font-bold text-slate-900">{pricing.annualRate}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold text-slate-500 mb-2">Quote an invoice</p>
                                                    <div className="space-y-2.5">
                                                        <div>
                                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount (৳)</label>
                                                            <input type="number" min="0" value={priceAmount} onChange={e => setPriceAmount(e.target.value)}
                                                                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tenor (days)</label>
                                                            <input type="number" min="1" max="365" value={priceTenor} onChange={e => setPriceTenor(e.target.value)}
                                                                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none" />
                                                        </div>
                                                        <button onClick={() => loadPricing(activeBuyer.buyerName, priceAmount, priceTenor)}
                                                            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95">
                                                            <DollarSign className="w-3.5 h-3.5" /> Reprice
                                                        </button>
                                                        <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-between">
                                                            <span className="text-[11px] font-semibold text-rose-600">Expected loss</span>
                                                            <span className="text-xs font-bold text-rose-700">৳{Number(pricing.expectedLoss).toLocaleString()}</span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 leading-relaxed">
                                                            A weaker score raises the default probability, which widens the risk premium and the quoted discount.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                
                        </div>
                    </div>
                </div>
            )}

            </div>
        </div>
    );
}

function SummaryCard({ label, value, accent }) {
    const bars = { slate: 'border-l-slate-400', emerald: 'border-l-emerald-500', amber: 'border-l-amber-500', rose: 'border-l-rose-500' };
    return (
        <div className={`bg-white border border-slate-200/80 border-l-4 ${bars[accent]} rounded-xl p-5 shadow-sm`}>
            <h3 className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">{label}</h3>
            <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
        </div>
    );
}

function MetricMini({ icon, label, value }) {
    return (
        <div className="hidden md:block">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5 flex items-center justify-end gap-1">{icon}{label}</p>
            <p className="text-slate-800 text-sm font-semibold">{value}</p>
        </div>
    );
}

function ComponentBar({ label, weight, value, icon }) {
    let color = 'bg-emerald-500';
    if (value < 50) color = 'bg-rose-500';
    else if (value < 75) color = 'bg-amber-500';
    return (
        <div className="mb-3.5">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">{icon}{label} <span className="text-slate-300 font-normal">&middot; {weight}</span></span>
                <span className="text-xs font-bold text-slate-700">{value}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className={color} style={{ width: value + '%', height: '100%' }}></div>
            </div>
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div className="bg-white border border-slate-200/70 rounded-lg p-2.5 text-center">
            <p className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">{label}</p>
            <p className="text-slate-800 text-sm font-bold mt-0.5">{value}</p>
        </div>
    );
}

function PolicyRow({ label, suffix, value, onChange, step }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-600">{label} <span className="text-slate-300 text-xs">{suffix}</span></span>
            <input type="number" step={step} value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 text-right focus:outline-none" />
        </div>
    );
}

function RateBar({ label, value, total, color }) {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
        <div>
            <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] text-slate-500">{label}</span>
                <span className="text-[11px] font-semibold text-slate-700">{value}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={color + ' h-full rounded-full'} style={{ width: pct + '%' }}></div>
            </div>
        </div>
    );
}

function WeightRow({ label, value, onChange }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-slate-600">{label}</span>
                <span className="text-sm font-bold text-slate-800">{value}%</span>
            </div>
            <div className="flex items-center gap-3">
                <input type="range" min="0" max="100" step="1" value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="flex-1 accent-emerald-600" />
                <input type="number" min="0" max="100" value={value}
                    onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none" />
            </div>
        </div>
    );
}

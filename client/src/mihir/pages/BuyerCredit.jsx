import React, { useState, useEffect } from 'react';
import {
    Gauge, RefreshCw, ShieldCheck, AlertTriangle, Clock,
    FileCheck2, TrendingUp, History, ChevronRight, Landmark
} from 'lucide-react';

// Colour + label styling for each rating band.
function ratingStyle(rating) {
    if (rating === 'Excellent') return { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: 'text-emerald-500', dot: 'bg-emerald-500' };
    if (rating === 'Good') return { badge: 'bg-sky-50 text-sky-700 border-sky-200', ring: 'text-sky-500', dot: 'bg-sky-500' };
    if (rating === 'Fair') return { badge: 'bg-amber-50 text-amber-700 border-amber-200', ring: 'text-amber-500', dot: 'bg-amber-500' };
    return { badge: 'bg-rose-50 text-rose-700 border-rose-200', ring: 'text-rose-500', dot: 'bg-rose-500' };
}

export default function BuyerCredit() {
    const [buyers, setBuyers] = useState([]);
    const [summary, setSummary] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [recalculating, setRecalculating] = useState(false);

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

    // Recompute every buyer's score, then reload (also appends history rows).
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

    // Expand a buyer and pull their score-change history.
    function toggle(name) {
        if (expanded === name) {
            setExpanded(null);
            setHistory([]);
            return;
        }
        setExpanded(name);
        setHistory([]);
        fetch('/api/credit/buyers/' + encodeURIComponent(name) + '/history')
            .then(r => r.json())
            .then(data => setHistory(data))
            .catch(err => console.error(err));
    }

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

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <h1 className="text-[26px] font-bold text-slate-900 tracking-tight">Buyer Credit Scores</h1>
                    <p className="text-slate-500 mt-1 text-sm">A weighted, explainable credit score per buyer &mdash; read by pricing and the risk engine.</p>
                </div>
                <button
                    onClick={handleRecalculate}
                    disabled={recalculating}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-60 shadow-sm"
                >
                    <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
                    {recalculating ? 'Recomputing...' : 'Recompute Scores'}
                </button>
            </div>

            {/* Summary cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    <SummaryCard label="Average Score" value={summary.averageScore} accent="slate" />
                    <SummaryCard label="Excellent / Good" value={summary.excellent + ' / ' + summary.good} accent="emerald" />
                    <SummaryCard label="Fair" value={summary.fair} accent="amber" />
                    <SummaryCard label="Poor" value={summary.poor} accent="rose" />
                </div>
            )}

            {/* Buyer list */}
            <div className="space-y-3.5">
                {buyers.map(buyer => {
                    const s = ratingStyle(buyer.rating);
                    const isOpen = expanded === buyer.buyerName;
                    return (
                        <div key={buyer.buyerName} className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all ${isOpen ? 'border-slate-300 ring-1 ring-slate-200' : 'border-slate-200/80 hover:border-slate-300'}`}>
                            <div className="p-5 flex items-center justify-between cursor-pointer" onClick={() => toggle(buyer.buyerName)}>
                                <div className="flex items-center gap-5">
                                    {/* score dial */}
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
                                            <span className="text-slate-400 text-xs font-medium">{buyer.metrics.totalInvoices} invoices &middot; {buyer.metrics.confirmationCount} confirmed</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-8 text-right">
                                    <MetricMini icon={<Clock className="w-3.5 h-3.5" />} label="Days to Pay" value={buyer.metrics.avgDaysToPay === null ? '—' : buyer.metrics.avgDaysToPay} />
                                    <MetricMini icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Disputes" value={buyer.metrics.disputeCount} />
                                    <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                                </div>
                            </div>

                            {isOpen && (
                                <div className="px-6 pb-6 pt-2 border-t border-slate-100 bg-slate-50/50 grid md:grid-cols-2 gap-8">
                                    {/* Left: weighted component breakdown */}
                                    <div>
                                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-4">
                                            <Gauge className="w-3.5 h-3.5" /> Score Breakdown
                                        </h4>
                                        <ComponentBar label="Payment Speed" weight="30%" value={buyer.components.paymentSpeed} icon={<TrendingUp className="w-3.5 h-3.5" />} />
                                        <ComponentBar label="On-Time Reliability" weight="25%" value={buyer.components.reliability} icon={<Clock className="w-3.5 h-3.5" />} />
                                        <ComponentBar label="Dispute-Free Record" weight="25%" value={buyer.components.disputeFree} icon={<ShieldCheck className="w-3.5 h-3.5" />} />
                                        <ComponentBar label="Track Record" weight="20%" value={buyer.components.trackRecord} icon={<FileCheck2 className="w-3.5 h-3.5" />} />

                                        <div className="grid grid-cols-3 gap-2 mt-5">
                                            <Stat label="Confirmed" value={buyer.metrics.confirmationCount} />
                                            <Stat label="Overdue" value={buyer.metrics.overdueCount} />
                                            <Stat label="Financed" value={'৳' + Number(buyer.metrics.financedVolume).toLocaleString()} />
                                        </div>
                                    </div>

                                    {/* Right: transparent score history */}
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
                            )}
                        </div>
                    );
                })}

                {buyers.length === 0 && (
                    <div className="text-center py-12 bg-white border border-slate-200/80 rounded-2xl border-dashed">
                        <Gauge className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm font-medium">No buyer activity to score yet.</p>
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
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">{icon}{label} <span className="text-slate-300 font-normal">· {weight}</span></span>
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

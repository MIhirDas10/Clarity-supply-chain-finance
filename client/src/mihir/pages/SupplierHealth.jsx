import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, AlertTriangle, FileWarning, ArrowRight, TrendingDown, Clock, Star, Eye } from 'lucide-react';

export default function SupplierHealth() {
    const [suppliers, setSuppliers] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [recalculating, setRecalculating] = useState(false);
    const [watchlistingId, setWatchlistingId] = useState(null);
    const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

    function loadData() {
        Promise.all([
            fetch('/api/health/suppliers').then(res => res.json()),
            fetch('/api/health/alerts').then(res => res.json()),
            fetch('/api/health/config').then(res => res.json())
        ])
        .then(([suppliersData, alertsData, configData]) => {
            setSuppliers(suppliersData);
            setAlerts(alertsData);
            setConfig(configData);
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
        fetch('/api/health/recalculate', { method: 'POST' })
            .then(res => res.json())
            .then(() => {
                loadData();
                setRecalculating(false);
            })
            .catch(err => {
                console.error(err);
                setRecalculating(false);
            });
    }

    function dismissAlert(id) {
        fetch(`/api/health/alerts/${id}/acknowledge`, { method: 'PATCH' })
            .then(res => res.json())
            .then(() => loadData())
            .catch(err => console.error(err));
    }

    function toggleExpand(id) {
        setExpandedId(expandedId === id ? null : id);
    }

    // Add or remove one supplier from the buyer's review watchlist. The button
    // lives inside the clickable row, so stopPropagation keeps it from also
    // expanding the row. After it saves, we reload so the badge and the
    // watchlist count update.
    function toggleWatchlist(id, e) {
        e.stopPropagation();
        setWatchlistingId(id);
        fetch(`/api/health/suppliers/${id}/watchlist`, { method: 'POST' })
            .then(res => res.json())
            .then(() => {
                loadData();
                setWatchlistingId(null);
            })
            .catch(err => {
                console.error(err);
                setWatchlistingId(null);
            });
    }

    const total = suppliers.length;
    const healthyCount = suppliers.filter(s => s.band === 'Healthy').length;
    const watchCount = suppliers.filter(s => s.band === 'Watch').length;
    const distressCount = suppliers.filter(s => s.band === 'Distress').length;

    // Watchlist: how many are flagged, and which suppliers to actually show
    // (all of them, or only the flagged ones when the filter is on).
    const watchlistCount = suppliers.filter(s => s.watchlisted).length;
    const visibleSuppliers = showWatchlistOnly ? suppliers.filter(s => s.watchlisted) : suppliers;

    function percentOf(count) {
        if (total === 0) return 0;
        return Math.round((count / total) * 100);
    }

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center text-slate-400">
                    <Activity className="w-7 h-7 animate-pulse mb-3 text-slate-400" />
                    <p className="font-medium text-sm text-slate-500">Loading risk analytics...</p>
                </div>
            </div>
        );
    }

    const openAlerts = alerts.filter(a => !a.is_read);

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-7">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Supplier Risk Panel</h1>
                    <p className="text-slate-500 mt-1 text-sm">Real-time health analytics and distress monitoring.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all active:scale-95 ${showWatchlistOnly ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                        <Eye className="w-4 h-4" />
                        {showWatchlistOnly ? 'Showing Watchlist' : 'Watchlist'} ({watchlistCount})
                    </button>
                    <button
                        onClick={handleRecalculate}
                        disabled={recalculating}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-60 shadow-sm"
                    >
                        <Activity className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
                        {recalculating ? 'Analyzing...' : 'Recalculate Scores'}
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {openAlerts.length > 0 && (
                <div className="space-y-3">
                    {openAlerts.map(alert => (
                        <div key={alert.id} className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3.5">
                                <AlertTriangle className="w-5 h-5 text-amber-400" />
                                <div>
                                    <h4 className="font-semibold text-sm text-slate-100">Distress Signal Detected</h4>
                                    <p className="text-slate-300 text-sm mt-0.5">{alert.message}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => dismissAlert(alert.id)}
                                className="px-3.5 py-1.5 rounded-md text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all border border-slate-700"
                            >
                                Acknowledge
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Neutral Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <div className="bg-white border border-slate-200/90 shadow-sm rounded-xl p-5">
                    <div className="flex items-center justify-between text-slate-400">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider">Total Suppliers</h3>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{total}</p>
                </div>
                
                <div className="bg-white border border-slate-200/90 shadow-sm rounded-xl p-5">
                    <div className="flex items-center justify-between text-slate-400">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider">Healthy (&gt;{config?.watchBelow || 80})</h3>
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{healthyCount}</p>
                </div>

                <div className="bg-white border border-slate-200/90 shadow-sm rounded-xl p-5">
                    <div className="flex items-center justify-between text-slate-400">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider">Watch (&lt;{config?.watchBelow || 80})</h3>
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{watchCount}</p>
                </div>

                <div className="bg-white border border-slate-200/90 shadow-sm rounded-xl p-5">
                    <div className="flex items-center justify-between text-slate-400">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider">Distress (&lt;{config?.distressBelow || 60})</h3>
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{distressCount}</p>
                </div>
            </div>

            {/* Muted Risk Distribution Bar */}
            {total > 0 && (
                <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm space-y-2.5">
                    <div className="flex justify-between items-center text-xs text-slate-500 font-medium">
                        <span>Portfolio Risk Distribution</span>
                        <span>{healthyCount} of {total} Healthy</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-100">
                        <div className="bg-emerald-600/80" style={{ width: percentOf(healthyCount) + '%' }}></div>
                        <div className="bg-amber-500/80" style={{ width: percentOf(watchCount) + '%' }}></div>
                        <div className="bg-rose-500/80" style={{ width: percentOf(distressCount) + '%' }}></div>
                    </div>
                    <div className="flex items-center gap-6 text-[11px] text-slate-500 font-medium pt-0.5">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-600/80"></span>Healthy {percentOf(healthyCount)}%</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2 rounded-full bg-amber-500/80"></span>Watch {percentOf(watchCount)}%</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500/80"></span>Distress {percentOf(distressCount)}%</span>
                    </div>
                </div>
            )}

            {/* Supplier List */}
            <div className="space-y-3.5">
                {visibleSuppliers.map(supplier => {
                    const isDistress = supplier.band === 'Distress';
                    const isWatch = supplier.band === 'Watch';

                    let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
                    let scoreBg = 'bg-slate-100 text-slate-800 border-slate-200';

                    if (isDistress) {
                        badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200/80';
                        scoreBg = 'bg-rose-50 text-rose-700 border-rose-200/80';
                    } else if (isWatch) {
                        badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200/80';
                        scoreBg = 'bg-amber-50 text-amber-700 border-amber-200/80';
                    } else {
                        badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
                        scoreBg = 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
                    }

                    const isExpanded = expandedId === supplier.id;

                    return (
                        <div
                            key={supplier.id}
                            className={`bg-white border border-slate-200/90 rounded-xl overflow-hidden transition-all duration-200 shadow-sm ${isExpanded ? 'border-slate-300 ring-1 ring-slate-200' : 'hover:border-slate-300'}`}
                        >
                            <div 
                                className="p-5 flex items-center justify-between cursor-pointer"
                                onClick={() => toggleExpand(supplier.id)}
                            >
                                <div className="flex items-center space-x-5 w-1/3">
                                    {/* Clean Numeric Score Block */}
                                    <div className={`w-12 h-12 rounded-lg border flex flex-col items-center justify-center font-semibold shrink-0 ${scoreBg}`}>
                                        <span className="text-sm font-bold leading-none">{supplier.score}</span>
                                        <span className="text-[9px] opacity-70 mt-0.5 font-medium">/ 100</span>
                                    </div>

                                    <div>
                                        <h2 className="text-base font-bold text-slate-900">{supplier.name}</h2>
                                        <div className="flex items-center space-x-2 mt-1">
                                            <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold tracking-wider uppercase ${badgeStyle}`}>
                                                {supplier.band}
                                            </span>
                                            {supplier.watchlisted && (
                                                <span className="px-2 py-0.5 rounded border text-[10px] font-semibold tracking-wider uppercase bg-indigo-50 text-indigo-700 border-indigo-200/80">
                                                    On Watchlist
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-10 text-right flex-1 justify-end pr-3">
                                    <div className="hidden md:block">
                                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Total Invoices</p>
                                        <p className="text-slate-800 text-sm font-semibold">{supplier.totalInvoices}</p>
                                    </div>
                                    <div className="hidden md:block">
                                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Early Funding</p>
                                        <p className="text-slate-800 text-sm font-semibold">{supplier.earlyFundingRate}%</p>
                                    </div>
                                    <div className="hidden md:block">
                                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Disputed</p>
                                        <p className="text-slate-800 text-sm font-semibold">{supplier.disputed}</p>
                                    </div>
                                    <button
                                        onClick={(e) => toggleWatchlist(supplier.id, e)}
                                        disabled={watchlistingId === supplier.id}
                                        className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${supplier.watchlisted ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <Star className="w-3 h-3" fill={supplier.watchlisted ? 'currentColor' : 'none'} />
                                        {watchlistingId === supplier.id ? 'Saving...' : supplier.watchlisted ? 'Watching' : 'Watch'}
                                    </button>
                                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-50 border border-slate-200/80 text-slate-400">
                                        <ArrowRight className={`w-3.5 h-3.5 transform transition-transform duration-200 ${isExpanded ? 'rotate-90 text-slate-800' : ''}`} />
                                    </div>
                                </div>
                            </div>

                            {/* Desaturated Technical Expanded Area */}
                            {isExpanded && (
                                <div className="px-6 pb-6 pt-3 border-t border-slate-100 bg-slate-50/60">
                                    <div className="flex gap-8">
                                        
                                        {/* Left Column: Data Grid */}
                                        <div className="w-1/2 space-y-3.5">
                                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                <Activity className="w-3.5 h-3.5 text-slate-500" />
                                                Analyzed Metrics
                                            </h4>
                                            
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-white rounded-lg p-3.5 border border-slate-200/80 shadow-xs">
                                                    <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                                                        <TrendingDown className="w-3.5 h-3.5" />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">Early Funded</span>
                                                    </div>
                                                    <p className="text-lg font-bold text-slate-800">{supplier.earlyFunded} / {supplier.totalInvoices}</p>
                                                </div>
                                                <div className="bg-white rounded-lg p-3.5 border border-slate-200/80 shadow-xs">
                                                    <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                                                        <Activity className="w-3.5 h-3.5" />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">Avg Discount</span>
                                                    </div>
                                                    <p className="text-lg font-bold text-slate-800">{supplier.avgDiscountRate}%</p>
                                                </div>
                                                <div className="bg-white rounded-lg p-3.5 border border-slate-200/80 shadow-xs">
                                                    <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                                                        <AlertTriangle className="w-3.5 h-3.5" />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">Disputes</span>
                                                    </div>
                                                    <p className="text-lg font-bold text-slate-800">{supplier.disputed}</p>
                                                </div>
                                                <div className="bg-white rounded-lg p-3.5 border border-slate-200/80 shadow-xs">
                                                    <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider">Corrections</span>
                                                    </div>
                                                    <p className="text-lg font-bold text-slate-800">{supplier.lateCorrections}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Column: Reasoning Engine Output */}
                                        <div className="w-1/2 space-y-3.5">
                                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                <FileWarning className="w-3.5 h-3.5 text-slate-500" />
                                                Computation Trace
                                            </h4>
                                            <div className="bg-white rounded-lg p-4 border border-slate-200/80 shadow-xs space-y-3">
                                                <div className="flex items-start gap-2.5">
                                                    <div className="mt-0.5 p-1 rounded bg-slate-100 text-slate-600 shrink-0">
                                                        <ShieldCheck className="w-3 h-3" />
                                                    </div>
                                                    <p className="text-slate-600 text-xs font-medium">Base trust score initialized: 100 pts</p>
                                                </div>

                                                {supplier.reasons.map((reason, idx) => (
                                                    <div key={idx} className="flex items-start gap-2.5">
                                                        <div className={`mt-0.5 p-1 rounded shrink-0 ${reason.includes('-') ? 'bg-slate-100 text-slate-700' : 'bg-slate-100 text-slate-600'}`}>
                                                            {reason.includes('-') ? <AlertTriangle className="w-3 h-3 text-slate-600" /> : <ShieldCheck className="w-3 h-3 text-slate-600" />}
                                                        </div>
                                                        <p className="text-slate-600 text-xs font-medium leading-relaxed">{reason}</p>
                                                    </div>
                                                ))}

                                                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                                                    <span className="text-xs font-semibold text-slate-500">Calculated Health Rating</span>
                                                    <span className="text-sm font-bold text-slate-900">
                                                        {supplier.score} / 100
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {visibleSuppliers.length === 0 && (
                    <div className="text-center py-12 bg-white border border-slate-200/80 rounded-xl border-dashed">
                        <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm font-medium">
                            {showWatchlistOnly ? 'No suppliers on your watchlist yet. Click "Watch" on a supplier to add them.' : 'No supplier risk records found.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

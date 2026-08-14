import React, { useState, useEffect } from "react";
import {
  TrendingUp, Calendar, DollarSign, Briefcase, Layers,
  ArrowUpRight, ShieldCheck, Zap, Clock, ChevronRight,
  RefreshCw, AlertCircle, CheckCircle2, PieChart, Sliders,
} from "lucide-react";

export default function CashFlowForecast() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scenario, setScenario] = useState("compare");
  const [selectedBucket, setSelectedBucket] = useState("all");
  const [payroll, setPayroll] = useState(2500000);
  const [procurement, setProcurement] = useState(3500000);
  const [opex, setOpex] = useState(1200000);

  const fetchForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cashflow/forecast?supplierId=1");
      if (!res.ok) throw new Error("Failed to fetch forecast data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
      setError("Could not load cash flow forecast.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchForecast(); }, []);

  const formatTk = (amount) => "৳ " + amount.toLocaleString("en-IN");

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="animate-spin text-slate-600 mb-3" size={32} />
        <p className="text-slate-600 text-sm font-medium">Computing 30-, 60-, and 90-day cash flow projections...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-xl mx-auto mt-8 bg-red-50 border border-red-200 rounded-xl text-center">
        <AlertCircle className="text-red-500 mx-auto mb-2" size={32} />
        <h3 className="text-red-800 font-semibold text-lg">Unable to Load Forecast</h3>
        <p className="text-red-600 text-sm mt-1">{error || "Something went wrong"}</p>
        <button onClick={fetchForecast} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-all">Retry</button>
      </div>
    );
  }

  const { summary, timeline, invoices } = data;

  const filteredInvoices = invoices.filter((inv) => {
    if (selectedBucket === "all") return true;
    if (selectedBucket === "0-30") return inv.bucket === "0-30 Days";
    if (selectedBucket === "31-60") return inv.bucket === "31-60 Days";
    if (selectedBucket === "61-90") return inv.bucket === "61-90 Days";
    return true;
  });

  const monthlyExpense = payroll + procurement + opex;
  const expense90Days = monthlyExpense * 3;
  const activeInflowForecast = scenario === "early" ? summary.totalPortfolioEarly : summary.totalPortfolioMaturity;
  const netLiquidityCoverage = activeInflowForecast - expense90Days;
  const coverageRatio = expense90Days > 0 ? Math.round((activeInflowForecast / expense90Days) * 100) : 100;

  const maxCum = Math.max(summary.totalPortfolioMaturity, summary.totalPortfolioEarly, 1);
  const chartHeight = 180;
  const chartWidth = 700;
  const step = Math.max(1, Math.floor(timeline.length / 15));
  const sampledPoints = timeline.filter((_, idx) => idx % step === 0 || idx === timeline.length - 1);

  const getSvgX = (index, total) => (index / (total - 1)) * chartWidth;
  const getSvgY = (val) => chartHeight - (val / maxCum) * (chartHeight - 20);

  const pointsMaturityStr = sampledPoints.map((pt, i) => `${getSvgX(i, sampledPoints.length)},${getSvgY(pt.cumulativeMaturity)}`).join(" ");
  const pointsEarlyStr = sampledPoints.map((pt, i) => `${getSvgX(i, sampledPoints.length)},${getSvgY(pt.cumulativeEarly)}`).join(" ");

  return (
    <div className="p-6 max-w-[1320px] mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
              <Zap size={12} /> Real-Time Engine Active
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cash Flow Forecast Engine</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Projected 30-, 60-, and 90-day forward cash flow timeline derived from all active receivables.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchForecast} className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Sync Forecast
          </button>
        </div>
      </div>

      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-800 rounded-lg text-emerald-400"><Sliders size={20} /></div>
          <div>
            <h3 className="text-sm font-semibold text-white">Forecast Scenario & Branching Mode</h3>
            <p className="text-xs text-slate-400">Switch curves to compare immediate early liquidity against holding invoices to full maturity.</p>
          </div>
        </div>
        <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
          {["compare", "early", "maturity"].map((s) => (
            <button key={s} onClick={() => setScenario(s)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${scenario === s ? (s === "maturity" ? "bg-slate-700 text-white font-semibold shadow-sm" : "bg-emerald-600 text-white font-semibold shadow-sm") : "text-slate-300 hover:text-white"}`}>
              {s === "compare" ? "Compare Both" : s === "early" ? "Early Funding (97% Net)" : "Hold to Maturity (100%)"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          { label: "0 – 30 Days Bucket", sub: "Immediate Forward Inflows", tag: "Near Term", color: "emerald", data: summary.total30Days, code: "30D" },
          { label: "31 – 60 Days Bucket", sub: "Mid Term Expected Receivables", tag: "Mid Term", color: "blue", data: summary.total60Days, code: "60D" },
          { label: "61 – 90 Days Bucket", sub: "Longer Horizon Receivables", tag: "Full Horizon", color: "indigo", data: summary.total90Days, code: "90D" },
        ].map((b) => (
          <div key={b.code} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg bg-${b.color}-50 text-${b.color}-600 flex items-center justify-center font-bold text-xs`}>{b.code}</div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{b.label}</h4>
                  <p className="text-[11px] text-slate-400">{b.sub}</p>
                </div>
              </div>
              <span className={`text-xs bg-${b.color}-100 text-${b.color}-800 font-semibold px-2 py-0.5 rounded-full`}>{b.tag}</span>
            </div>
            <div className="space-y-2 mt-4">
              <div>
                <p className="text-xs text-slate-400 font-medium">Discounted Early Payout</p>
                <p className={`text-xl font-bold text-${b.color}-700`}>{formatTk(b.data.early)}</p>
              </div>
              <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                <span className="text-slate-500">Hold to Maturity:</span>
                <span className="font-semibold text-slate-900">{formatTk(b.data.maturity)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><TrendingUp className="text-emerald-600" size={20} />Projected 90-Day Cumulative Cash Balance Curve</h3>
            <p className="text-xs text-slate-500 mt-0.5">Accumulated cash inflows projected over 90 days across active supplier invoices.</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            {(scenario === "compare" || scenario === "early") && (<div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-600 inline-block"></span><span className="font-semibold text-slate-700">Early Funding Curve</span></div>)}
            {(scenario === "compare" || scenario === "maturity") && (<div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-900 inline-block"></span><span className="font-semibold text-slate-700">Maturity Holding Curve</span></div>)}
          </div>
        </div>
        <div className="w-full overflow-x-auto py-2">
          <div className="min-w-[650px]">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-48 overflow-visible">
              <line x1="0" y1="30" x2={chartWidth} y2="30" stroke="#F1F5F9" strokeDasharray="4" />
              <line x1="0" y1="80" x2={chartWidth} y2="80" stroke="#F1F5F9" strokeDasharray="4" />
              <line x1="0" y1="130" x2={chartWidth} y2="130" stroke="#F1F5F9" strokeDasharray="4" />
              <line x1={chartWidth * (1/3)} y1="0" x2={chartWidth * (1/3)} y2={chartHeight} stroke="#E2E8F0" strokeDasharray="2" />
              <line x1={chartWidth * (2/3)} y1="0" x2={chartWidth * (2/3)} y2={chartHeight} stroke="#E2E8F0" strokeDasharray="2" />
              {(scenario === "compare" || scenario === "maturity") && (<polyline fill="none" stroke="#0F172A" strokeWidth="3" points={pointsMaturityStr} strokeLinecap="round" strokeLinejoin="round" />)}
              {(scenario === "compare" || scenario === "early") && (<polyline fill="none" stroke="#059669" strokeWidth="3" points={pointsEarlyStr} strokeLinecap="round" strokeLinejoin="round" />)}
              {sampledPoints.map((pt, i) => {
                const x = getSvgX(i, sampledPoints.length);
                return (
                  <g key={i}>
                    {(scenario === "compare" || scenario === "maturity") && (<circle cx={x} cy={getSvgY(pt.cumulativeMaturity)} r="4" fill="#0F172A" />)}
                    {(scenario === "compare" || scenario === "early") && (<circle cx={x} cy={getSvgY(pt.cumulativeEarly)} r="4" fill="#059669" />)}
                  </g>
                );
              })}
            </svg>
            <div className="flex justify-between text-[11px] text-slate-400 font-medium pt-2 border-t border-slate-100 px-1">
              <span>Day 0 (Today)</span><span>Day 30 (1st Month)</span><span>Day 60 (2nd Month)</span><span>Day 90 (3rd Month)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Briefcase className="text-slate-800" size={20} />Operating Expense Planning Calculator</h3>
            <p className="text-xs text-slate-500 mt-0.5">Input estimated monthly business obligations to test cash flow liquidity coverage over the 90-day period.</p>
          </div>
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${netLiquidityCoverage >= 0 ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"}`}>
            {netLiquidityCoverage >= 0 ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            Coverage Ratio: {coverageRatio}% ({netLiquidityCoverage >= 0 ? "Surplus" : "Deficit"})
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Monthly Payroll & Salaries (৳)", val: payroll, set: setPayroll },
            { label: "Monthly Procurement & Supplies (৳)", val: procurement, set: setProcurement },
            { label: "Monthly Utilities & OpEx (৳)", val: opex, set: setOpex },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{f.label}</label>
              <input type="number" value={f.val} onChange={(e) => f.set(Number(e.target.value) || 0)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium" />
            </div>
          ))}
        </div>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row justify-between text-xs font-medium text-slate-700 gap-1">
            <span>Projected 90-Day Expenses: <strong>{formatTk(expense90Days)}</strong></span>
            <span>Forecasted Cash Inflow ({scenario}): <strong>{formatTk(activeInflowForecast)}</strong></span>
            <span className={netLiquidityCoverage >= 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold"}>Net Liquidity Status: {formatTk(netLiquidityCoverage)}</span>
          </div>
          <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${Math.min(100, coverageRatio)}%` }}></div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Active Receivables ({invoices.length})</h3>
            <p className="text-xs text-slate-500 mt-0.5">Detailed breakdown of active invoices contributing to the forward cash-flow timeline.</p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            {[{ k: "all", l: `All Invoices (${invoices.length})` }, { k: "0-30", l: "0–30 Days" }, { k: "31-60", l: "31–60 Days" }, { k: "61-90", l: "61–90 Days" }].map((b) => (
              <button key={b.k} onClick={() => setSelectedBucket(b.k)} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${selectedBucket === b.k ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}>{b.l}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Invoice #</th><th className="py-3 px-4">Buyer Name</th><th className="py-3 px-4">Status</th><th className="py-3 px-4">Maturity Date</th><th className="py-3 px-4 text-right">Full Amount</th><th className="py-3 px-4 text-right">Early Payout (97%)</th><th className="py-3 px-4 text-center">Bucket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900">{inv.invoiceNumber}</td>
                  <td className="py-3 px-4 font-medium text-slate-800">{inv.buyerName}</td>
                  <td className="py-3 px-4"><span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">{inv.status}</span></td>
                  <td className="py-3 px-4 text-slate-600 font-medium">{inv.dueDate} ({inv.daysToMaturity}d left)</td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">{formatTk(inv.fullMaturityAmount)}</td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-700">{formatTk(inv.discountedEarlyAmount)}</td>
                  <td className="py-3 px-4 text-center"><span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">{inv.bucket}</span></td>
                </tr>
              ))}
              {filteredInvoices.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400 italic">No active invoices found in this forecast bucket.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

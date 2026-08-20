import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, WalletCards } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";

function authHeaders() {
  const token = localStorage.getItem("clarity_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function money(value) {
  return `BDT ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function RepaymentSettlement() {
  const { user } = useAuth();
  const isFunder = user?.role === "funder";
  const canOperate = user?.role === "buyer" || user?.role === "admin";
  const [due, setDue] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [returnRates, setReturnRates] = useState({});
  const [wallet, setWallet] = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const headers = authHeaders();
    const [dueResponse, settledResponse] = await Promise.all([
      fetch("/api/settlements/due", { headers }),
      fetch("/api/settlements", { headers }),
    ]);
    if (!dueResponse.ok || !settledResponse.ok) throw new Error("Could not load the settlement queue");
    setDue(await dueResponse.json());
    setSettlements(await settledResponse.json());
    if (user?.role === "buyer") {
      const walletResponse = await fetch("/api/settlements/buyer-wallet", { headers });
      if (walletResponse.ok) setWallet(await walletResponse.json());
    }
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, [user?.role]);

  async function deposit() {
    const response = await fetch("/api/settlements/buyer-wallet/deposit", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(depositAmount) }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.message || "Could not fund buyer wallet");
    setWallet({ ...wallet, balance: data.balance });
    setDepositAmount("");
    setMessage("Buyer wallet funded. The payment-provider connection is a placeholder for now.");
  }

  function downloadReceipt(item) {
    // Placeholder PDF seam: replace the document body with a server-generated
    // signed PDF once the reporting service is connected.
    const content = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\n%% Clarity repayment receipt placeholder\nInvoice: ${item.invoice_number || item.invoice_id}\nReceived: ${money(item.amount_received)}\nFunder payout: ${money(item.funder_payout)}\nPlatform fee: ${money(item.platform_fee)}\n%%EOF`;
    const blob = new Blob([content], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clarity-repayment-${item.invoice_number || item.invoice_id}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function repay(invoice) {
    setMessage("");
    setError("");
    const response = await fetch(`/api/settlements/${invoice.id}/repay`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_received: Number(amounts[invoice.id] || invoice.invoice_amount),
        ...(returnRates[invoice.id] ? { return_rate: Number(returnRates[invoice.id]) } : {}),
      }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.message || "Repayment failed");
    setMessage(`Invoice ${invoice.invoice_number || invoice.id} settled through the waterfall.`);
    await load();
  }

  async function reconcile() {
    const response = await fetch("/api/settlements/reconcile-overdue", { method: "POST", headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) return setError(data.message || "Reconciliation failed");
    setMessage(`${data.escalated} overdue invoice${data.escalated === 1 ? "" : "s"} escalated.`);
    await load();
  }

  return (
    <div className="p-6 max-w-[1320px] mx-auto space-y-6">
      <header className="bg-slate-950 text-white rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><p className="text-xs uppercase tracking-widest text-emerald-300 font-semibold">Ameet / Module 3</p><h1 className="text-2xl font-bold mt-1">{isFunder ? "Investment Settlement" : "Repayment & Settlement"}</h1><p className="text-sm text-slate-300 mt-2">{isFunder ? "Monitor maturity dates, expected funder payouts, and completed settlement outcomes." : "Repay confirmed invoices at maturity and reconcile overdue buyer obligations."}</p></div>
        {canOperate && <button onClick={reconcile} className="px-4 py-2.5 rounded-lg bg-amber-400 text-slate-950 text-sm font-semibold flex items-center gap-2"><Clock3 size={16} /> Reconcile overdue</button>}
      </header>
      {message && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex gap-2"><CheckCircle2 size={17} />{message}</div>}
      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex gap-2"><AlertCircle size={17} />{error}</div>}
      {user?.role === "buyer" && <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-end justify-between gap-4"><div><p className="text-xs text-slate-500">Buyer repayment wallet</p><p className="text-2xl font-bold text-slate-900">{money(wallet?.balance)}</p><p className="text-xs text-slate-500 mt-1">Repayments debit this balance before funder settlement.</p></div><div className="flex gap-2"><input type="number" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="Demo top-up amount" className="border rounded-lg px-3 py-2 text-sm" /><button onClick={deposit} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold">Add funds</button></div></section>}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Metric label={isFunder ? "Investments awaiting maturity" : "Awaiting repayment"} value={due.length} icon={<WalletCards size={18} />} />
        <Metric label="Completed settlements" value={settlements.filter((item) => item.status === "Completed").length} icon={<CheckCircle2 size={18} />} />
        <Metric label="Overdue queue" value={due.filter((item) => item.repayment_state === "Overdue").length} icon={<Clock3 size={18} />} />
      </section>
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex justify-between items-center mb-4"><div><h2 className="font-bold text-slate-900">{isFunder ? "Maturity schedule" : "Buyer repayment queue"}</h2><p className="text-xs text-slate-500 mt-1">{isFunder ? "Read-only view of receivables where your capital is still deployed." : "The buyer repays the invoice face value once. Clarity deducts its facilitation fee from the settlement, so no extra fee payment is required."}</p></div><button onClick={() => load().catch((err) => setError(err.message))} title="Refresh queue" className="p-2 border rounded-lg text-slate-600"><RefreshCw size={16} /></button></div>
        <div className="space-y-3">
          {due.map((invoice) => <div key={invoice.id} className={`border border-slate-200 rounded-lg p-4 grid grid-cols-1 ${canOperate ? "lg:grid-cols-[1fr_180px_140px_120px]" : "lg:grid-cols-[1fr_180px_180px]"} gap-3 items-end`}>
            <div><p className="font-semibold text-slate-900">{invoice.invoice_number || `Invoice #${invoice.id}`}</p><p className="text-xs text-slate-500">{invoice.buyer_name || "Buyer"} · Due {invoice.due_date || "not set"}</p><p className="text-sm font-bold text-slate-700 mt-2">{isFunder ? "Deployed principal" : "Repayment face value"} {money(isFunder ? (invoice.payout_amount || invoice.invoice_amount) : invoice.invoice_amount)}</p></div>
            {canOperate && <label className="text-xs text-slate-500">Received amount<input type="number" value={amounts[invoice.id] ?? invoice.invoice_amount ?? ""} onChange={(event) => setAmounts({ ...amounts, [invoice.id]: event.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900" /></label>}
            {canOperate && <label className="text-xs text-slate-500">Optional return rate<input type="number" step="0.01" placeholder="Auto from invoice discount" value={returnRates[invoice.id] ?? ""} onChange={(event) => setReturnRates({ ...returnRates, [invoice.id]: event.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900" /></label>}
            {canOperate ? <button onClick={() => repay(invoice)} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold">Record repayment</button> : <div className="text-right text-sm text-slate-500">Expected repayment<br /><strong className="text-slate-900">{money(invoice.invoice_amount)}</strong></div>}
          </div>)}
          {!due.length && <p className="text-sm text-slate-500 py-5 text-center">No funded invoices are waiting for repayment.</p>}
        </div>
      </section>
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><h2 className="font-bold text-slate-900 mb-3">{isFunder ? "Received repayments" : "Completed settlement outcomes"}</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500 border-b"><th className="pb-2">Invoice</th><th className="pb-2">Received</th><th className="pb-2">Funder payout</th><th className="pb-2">Platform fee</th><th className="pb-2">Status</th>{isFunder && <th className="pb-2">Receipt</th>}</tr></thead><tbody>{settlements.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="py-3 font-medium">{item.invoice_number || item.invoice_id}</td><td>{money(item.amount_received)}</td><td>{money(item.funder_payout)}</td><td>{money(item.platform_fee)}</td><td><span className="text-emerald-700 font-semibold">{item.status}</span></td>{isFunder && <td><button onClick={() => downloadReceipt(item)} className="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700">Download PDF</button></td>}</tr>)}</tbody></table></div></section>
    </div>
  );
}

function Metric({ label, value, icon }) { return <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">{icon}</div><div><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold text-slate-900">{value}</p></div></div>; }
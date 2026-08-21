import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, ExternalLink, RefreshCw, Unplug } from "lucide-react";

function headers() { const token = localStorage.getItem("clarity_token"); return token ? { Authorization: `Bearer ${token}` } : {}; }

export default function RepaymentCalendar() {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [statusResponse, eventsResponse, invoicesResponse] = await Promise.all([fetch("/api/calendar/status", { headers: headers() }), fetch("/api/calendar/events", { headers: headers() }), fetch("/api/settlements/due", { headers: headers() })]);
    if (!statusResponse.ok || !eventsResponse.ok || !invoicesResponse.ok) throw new Error("Could not load calendar sync state");
    setStatus(await statusResponse.json()); setEvents(await eventsResponse.json()); setInvoices(await invoicesResponse.json());
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function connect() {
    const response = await fetch("/api/calendar/connect", { headers: headers() }); const data = await response.json();
    if (!response.ok) return setError(data.message || "Could not start Google connection"); window.location.assign(data.authorization_url);
  }
  async function sync() {
    if (!invoiceId) return setError("Select an invoice first");
    const response = await fetch(`/api/calendar/sync/${invoiceId}`, { method: "POST", headers: headers() }); const data = await response.json();
    if (!response.ok) return setError(data.message || "Could not sync invoice"); setMessage(`${data.events.length} calendar event${data.events.length === 1 ? "" : "s"} synced.`); setInvoiceId(""); await load();
  }
  async function disconnect() { await fetch("/api/calendar/disconnect", { method: "DELETE", headers: headers() }); setMessage("Google Calendar disconnected."); await load(); }

  return <div className="p-6 max-w-[1100px] mx-auto space-y-6">
    <header className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm"><div className="flex flex-col md:flex-row md:items-end justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-900 mt-1">Repayment Calendar</h1><p className="text-sm text-slate-500 mt-2">Keep due and expected maturity dates visible in the treasury calendar, with reminders seven days and one day before.</p></div>{status?.connected ? <button onClick={disconnect} className="px-3 py-2 border rounded-lg text-sm text-slate-700 flex items-center gap-2"><Unplug size={16} /> Disconnect</button> : <button onClick={connect} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2"><CalendarDays size={16} /> Connect Google Calendar</button>}</div></header>
    {message && <p className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{message}</p>}{error && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{error}</p>}
    <section className="bg-slate-950 text-white rounded-xl p-5"><div className="flex gap-3 items-start"><div className="p-2 rounded-lg bg-slate-800 text-blue-300"><CalendarDays size={20} /></div><div><h2 className="font-semibold">Sync an invoice</h2><p className="text-xs text-slate-300 mt-1">Choose a funded, unpaid invoice to add its due or maturity date to the connected calendar.</p></div></div><div className="mt-4 flex flex-col sm:flex-row gap-2"><select value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} className="flex-1 border border-slate-300 bg-white px-3 py-2 rounded-lg text-sm font-medium text-slate-900 shadow-sm" aria-label="Invoice to sync"><option className="bg-white text-slate-900" value="">{invoices.length ? "Select an invoice" : "No funded invoices need syncing"}</option>{invoices.map((invoice) => <option className="bg-white text-slate-900" key={invoice.id} value={invoice.id}>{invoice.invoice_number || `Invoice ${invoice.id}`} · ID {invoice.id} · Due {invoice.due_date || "date missing"} · BDT {Number(invoice.invoice_amount || 0).toLocaleString("en-IN")}</option>)}</select><button onClick={sync} disabled={!invoiceId} className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">Sync date</button></div></section>
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><div className="flex items-center justify-between mb-4"><div><h2 className="font-bold text-slate-900">Synced obligations</h2><p className="text-xs text-slate-500 mt-1">{status?.connected ? "Google connection active" : "Local mirror only"}</p></div><button onClick={() => load().catch((err) => setError(err.message))} title="Refresh events" className="p-2 border rounded-lg text-slate-600"><RefreshCw size={16} /></button></div><div className="space-y-2">{events.map((event) => <div key={event.id} className="flex items-center justify-between border-b last:border-0 py-3"><div className="flex gap-3 items-center"><div className="p-2 rounded-lg bg-blue-50 text-blue-700"><CalendarDays size={17} /></div><div><p className="text-sm font-semibold text-slate-900">{event.invoice_number || `Invoice ${event.invoice_id}`}</p><p className="text-xs text-slate-500">{event.event_kind === "buyer_due" ? "Buyer payment due" : "Funder expected maturity"} · {event.event_date}</p></div></div><span className="text-xs text-emerald-700 font-semibold flex items-center gap-1"><CheckCircle2 size={14} /> {event.status}</span></div>)}{!events.length && <p className="text-sm text-slate-500 py-6 text-center">No calendar obligations have been synced yet.</p>}</div></section>
    {status?.configured === false && <p className="text-xs text-slate-500 flex items-center gap-1"><ExternalLink size={13} /> Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable live Google events.</p>}
  </div>;
}
import { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Clock, History, FileText, Loader2, Search } from "lucide-react";
import ConfirmationModal from "../components/ConfirmationModal.jsx";
import DisputeModal from "../components/DisputeModal.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";

export default function BuyerConfirmation() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("pending");
  
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [confirmingInvoice, setConfirmingInvoice] = useState(null);
  const [disputingInvoice, setDisputingInvoice] = useState(null);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both pending and history based on tab
      let endpoint = activeTab === "pending" 
        ? `/api/confirmations/pending`
        : `/api/confirmations/history`;
        
      // We no longer pass ?buyer=... because the backend securely 
      // uses the logged-in user's token to filter invoices.
      const res = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('clarity_token')}`
        }
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to fetch invoices");
      
      setInvoices(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [activeTab]);

  const handleConfirmed = () => {
    setConfirmingInvoice(null);
    fetchInvoices();
  };

  const handleDisputed = () => {
    setDisputingInvoice(null);
    fetchInvoices();
  };

  const formatBDT = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return "৳ 0";
    return "৳ " + num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric"
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* ── Page Header ─────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Buyer Confirmation
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Review, confirm, or dispute invoices submitted by your suppliers.
          </p>
        </div>
      </div>

      <div className="max-w-5xl rounded-xl overflow-hidden" style={{ backgroundColor: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}>
        {/* ── Tabs ─────────────────────── */}
        <div className="flex items-center px-4 border-b" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-2 px-4 py-4 text-[13px] font-semibold border-b-2 transition-colors ${
              activeTab === "pending" 
                ? "border-emerald-500 text-emerald-600" 
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Clock size={16} />
            Pending Confirmation
            {activeTab === "pending" && !loading && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700">
                {invoices.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-4 py-4 text-[13px] font-semibold border-b-2 transition-colors ${
              activeTab === "history" 
                ? "border-blue-500 text-blue-600" 
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <History size={16} />
            Action History
          </button>
        </div>

        {/* ── Content ─────────────────────── */}
        <div className="p-0 min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[400px]">
              <Loader2 className="animate-spin text-gray-400 mb-2" size={24} />
              <p className="text-[13px] text-gray-500">Loading invoices...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-red-500">
              <AlertTriangle size={32} className="mb-2" />
              <p className="text-[13px] font-medium">{error}</p>
              <button onClick={fetchInvoices} className="mt-4 px-4 py-2 text-[12px] bg-red-50 text-red-700 rounded-lg font-medium hover:bg-red-100 transition-colors">
                Retry
              </button>
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[400px]">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3 border border-gray-100">
                <FileText className="text-gray-400" size={24} />
              </div>
              <p className="text-[14px] font-semibold text-gray-700">No Invoices Found</p>
              <p className="text-[12px] text-gray-500 mt-1">
                {activeTab === "pending" 
                  ? "You have no pending invoices to confirm." 
                  : "You have no confirmed or disputed invoices yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b text-[11px] font-bold text-gray-500 uppercase tracking-wider" style={{ borderColor: "var(--border)" }}>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Status</th>
                    {activeTab === "history" && <th className="py-3 px-4">Action Date</th>}
                    {activeTab === "pending" && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y text-[13px]" style={{ borderColor: "var(--border)" }}>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-semibold" style={{ color: "var(--text-primary)" }}>
                        {inv.invoice_number || inv.number}
                      </td>
                      <td className="py-3.5 px-4 font-medium" style={{ color: "var(--text-secondary)" }}>
                        {inv.supplier_id}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold" style={{ color: "var(--text-primary)" }}>
                        {formatBDT(inv.invoice_amount || inv.amount)}
                      </td>
                      <td className="py-3.5 px-4" style={{ color: "var(--text-secondary)" }}>
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                          inv.status === "Submitted" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          inv.status === "Buyer Confirmed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          inv.status === "Disputed" ? "bg-red-50 text-red-700 border-red-200" :
                          "bg-gray-50 text-gray-700 border-gray-200"
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      
                      {activeTab === "history" && (
                        <td className="py-3.5 px-4" style={{ color: "var(--text-secondary)" }}>
                          {formatDate(inv.buyer_confirmed_at || inv.updated_at)}
                        </td>
                      )}
                      
                      {activeTab === "pending" && (
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setDisputingInvoice(inv)}
                              className="px-3 py-1.5 rounded-md text-[11px] font-semibold border bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                            >
                              Dispute
                            </button>
                            <button
                              onClick={() => setConfirmingInvoice(inv)}
                              className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors cursor-pointer"
                            >
                              Confirm
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {confirmingInvoice && (
        <ConfirmationModal
          invoice={confirmingInvoice}
          onClose={() => setConfirmingInvoice(null)}
          onConfirmed={handleConfirmed}
        />
      )}

      {disputingInvoice && (
        <DisputeModal
          invoice={disputingInvoice}
          onClose={() => setDisputingInvoice(null)}
          onDisputed={handleDisputed}
        />
      )}
    </div>
  );
}

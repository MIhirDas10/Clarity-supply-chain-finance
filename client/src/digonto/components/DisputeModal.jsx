import { useState } from "react";
import { AlertTriangle, X, XCircle } from "lucide-react";

export default function DisputeModal({ invoice, onClose, onDisputed }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDispute = async () => {
    if (!reason.trim()) {
      setError("Please provide a reason for the dispute.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/confirmations/${invoice.id}/dispute`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem('clarity_token')}`
        },
        body: JSON.stringify({
          buyer_name: invoice.buyer_name,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to dispute invoice");
        return;
      }
      onDisputed(data);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const formatBDT = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return "৳ 0";
    return "৳ " + num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl p-0 overflow-hidden animate-fade-in"
        style={{ backgroundColor: "var(--card-bg)", boxShadow: "0 25px 50px rgba(0,0,0,0.15)" }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FEF2F2" }}>
                <AlertTriangle size={20} style={{ color: "#DC2626" }} />
              </div>
              <div>
                <h2 className="text-[17px] font-bold" style={{ color: "var(--text-primary)" }}>
                  Dispute Invoice
                </h2>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  Flag this invoice as inaccurate or under question
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer" style={{ color: "var(--text-muted)" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Invoice Summary */}
        <div className="px-6 py-4">
          <div className="rounded-xl p-4" style={{ backgroundColor: "#F8FAFC", border: "1px solid var(--border)" }}>
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Invoice #</p>
                <p className="font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{invoice.invoice_number || invoice.number || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Amount</p>
                <p className="font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{formatBDT(invoice.invoice_amount || invoice.amount)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Reason */}
        <div className="px-6 pb-4">
          <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
            Dispute Reason <span style={{ color: "var(--accent-red)" }}>*</span>
          </label>
          <textarea
            rows={4}
            placeholder="Explain why this invoice is being disputed (e.g., incorrect amount, goods not received, duplicate submission)..."
            value={reason}
            onChange={(e) => { setReason(e.target.value); if (error) setError(null); }}
            className="w-full px-3.5 py-2.5 text-[13px] rounded-lg border transition-all duration-200 resize-none"
            style={{ backgroundColor: "#F8FAFC", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 pb-3">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium" style={{ backgroundColor: "var(--accent-red-bg)", color: "var(--accent-red)" }}>
              <XCircle size={16} /> {error}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-[13px] font-medium border transition-all hover:bg-gray-50 cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleDispute}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-[13px] font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            style={{ backgroundColor: "#DC2626" }}
          >
            <AlertTriangle size={16} />
            {loading ? "Filing Dispute..." : "File Dispute"}
          </button>
        </div>
      </div>
    </div>
  );
}

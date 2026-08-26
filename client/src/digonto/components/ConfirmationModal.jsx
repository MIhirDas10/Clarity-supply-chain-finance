import { useState, useRef } from "react";
import { CheckCircle2, XCircle, Shield, X, Eraser } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";

export default function ConfirmationModal({ invoice, onClose, onConfirmed }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const sigCanvas = useRef({});

  const acknowledgmentText =
    "I, the authorized representative of the buyer entity, hereby confirm that the goods/services described in this invoice have been received in full and are accurate. I acknowledge the legally binding payment obligation for the stated amount on or before the due date.";

  const clearSignature = () => {
    sigCanvas.current.clear();
  };

  const handleConfirm = async () => {
    if (sigCanvas.current.isEmpty()) {
      setError("Please draw your signature to confirm.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const signatureBase64 = sigCanvas.current.getCanvas().toDataURL("image/png");

      const res = await fetch(`http://localhost:5001/api/confirmations/${invoice.id}/confirm`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem('clarity_token')}`
        },
        body: JSON.stringify({
          buyer_name: invoice.buyer_name,
          acknowledgment_text: acknowledgmentText,
          signatureBase64
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to confirm invoice");
        return;
      }
      onConfirmed(data);
    } catch (err) {
      console.error("Confirmation error:", err);
      setError("Error: " + err.message);
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
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#ECFDF5" }}>
                <Shield size={20} style={{ color: "#059669" }} />
              </div>
              <div>
                <h2 className="text-[17px] font-bold" style={{ color: "var(--text-primary)" }}>
                  Confirm Invoice
                </h2>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  Digital acknowledgment of payment obligation
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
                <p className="font-bold mt-0.5" style={{ color: "#059669" }}>{formatBDT(invoice.invoice_amount || invoice.amount)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Buyer</p>
                <p className="font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{invoice.buyer_name || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Due Date</p>
                <p className="font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{invoice.due_date || "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Legal Acknowledgment */}
        <div className="px-6 pb-2">
          <div className="rounded-xl p-4" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#92400E" }}>
              ⚖️ Legal Acknowledgment
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: "#78350F" }}>
              {acknowledgmentText}
            </p>
          </div>
        </div>

        {/* Signature Pad */}
        <div className="px-6 pb-4">
          <div className="flex justify-between items-end mb-1">
            <p className="text-[12px] font-semibold text-gray-700">Digital Signature</p>
            <button onClick={clearSignature} className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 cursor-pointer">
              <Eraser size={12} /> Clear
            </button>
          </div>
          <div className="border rounded-lg overflow-hidden bg-white" style={{ borderColor: "var(--border)" }}>
            <SignatureCanvas 
              ref={sigCanvas}
              penColor="black"
              canvasProps={{className: "w-full h-32 cursor-crosshair"}} 
            />
          </div>
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
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-[13px] font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            style={{ backgroundColor: "#059669" }}
          >
            <CheckCircle2 size={16} />
            {loading ? "Confirming..." : "Confirm & Acknowledge"}
          </button>
        </div>
      </div>
    </div>
  );
}

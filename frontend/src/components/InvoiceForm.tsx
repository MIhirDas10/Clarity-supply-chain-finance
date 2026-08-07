"use client";

import { useState, useMemo, type FormEvent } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, Zap } from "lucide-react";

interface InvoiceFormProps {
  onSuccess: () => void;
}

interface FormData {
  supplier_id: string;
  buyer_name: string;
  invoice_number: string;
  amount: string;
  due_date: string;
  file_url: string;
}

const initialForm: FormData = {
  supplier_id: "",
  buyer_name: "",
  invoice_number: "",
  amount: "",
  due_date: "",
  file_url: "",
};

/** Platform discount rate: 2.5% for 30 days, linearly prorated */
const DISCOUNT_RATE_30D = 0.025;
const MAX_DISCOUNT_DAYS = 30;

function formatBDT(value: number): string {
  return `৳${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function InvoiceForm({ onSuccess }: InvoiceFormProps) {
  const [form, setForm] = useState<FormData>(initialForm);
  const [loading, setLoading] = useState(false);
  const [discountDays, setDiscountDays] = useState(0);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (feedback) setFeedback(null);
  };

  // ── Discount calculation ──────────────────────────────────────────
  const fullAmount = parseFloat(form.amount) || 0;

  const { discountedAmount, discountPercent } = useMemo(() => {
    const pct = (DISCOUNT_RATE_30D / MAX_DISCOUNT_DAYS) * (MAX_DISCOUNT_DAYS - discountDays);
    const discounted = fullAmount * (1 - pct);
    return {
      discountedAmount: Math.round(discounted),
      discountPercent: +(pct * 100).toFixed(2),
    };
  }, [fullAmount, discountDays]);

  // Slider fill percentage for styling
  const sliderFill = (discountDays / MAX_DISCOUNT_DAYS) * 100;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          discount_days: discountDays,
          discounted_amount: discountedAmount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type: "error", message: data.error || "Something went wrong" });
        return;
      }

      setFeedback({ type: "success", message: "Invoice created successfully!" });
      setForm(initialForm);
      setDiscountDays(0);
      onSuccess();
    } catch {
      setFeedback({ type: "error", message: "Network error — please try again" });
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    backgroundColor: "#F8FAFC",
    borderColor: "var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <div
      className="rounded-xl p-6 animate-fade-in"
      style={{
        backgroundColor: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--accent-orange-bg)" }}
        >
          <Upload size={18} style={{ color: "var(--accent-orange)" }} />
        </div>
        <div>
          <h2
            className="text-[16px] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Upload New Invoice
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Submit invoice details for processing
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Supplier ID */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Supplier ID
            </label>
            <input
              type="text"
              placeholder="e.g. SUP-006"
              required
              value={form.supplier_id}
              onChange={(e) => handleChange("supplier_id", e.target.value)}
              className="w-full px-3.5 py-2.5 text-[13px] rounded-lg border transition-all duration-200"
              style={inputStyle}
            />
          </div>

          {/* Buyer Name */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Buyer Name
            </label>
            <input
              type="text"
              placeholder="e.g. Unilever BD"
              required
              value={form.buyer_name}
              onChange={(e) => handleChange("buyer_name", e.target.value)}
              className="w-full px-3.5 py-2.5 text-[13px] rounded-lg border transition-all duration-200"
              style={inputStyle}
            />
          </div>

          {/* Invoice Number */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Invoice Number
            </label>
            <input
              type="text"
              placeholder="e.g. INV-1006"
              required
              value={form.invoice_number}
              onChange={(e) => handleChange("invoice_number", e.target.value)}
              className="w-full px-3.5 py-2.5 text-[13px] rounded-lg border transition-all duration-200"
              style={inputStyle}
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Amount (৳)
            </label>
            <input
              type="number"
              placeholder="e.g. 2500000"
              required
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
              className="w-full px-3.5 py-2.5 text-[13px] rounded-lg border transition-all duration-200"
              style={inputStyle}
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Due Date
            </label>
            <input
              type="date"
              required
              value={form.due_date}
              onChange={(e) => handleChange("due_date", e.target.value)}
              className="w-full px-3.5 py-2.5 text-[13px] rounded-lg border transition-all duration-200"
              style={inputStyle}
            />
          </div>

          {/* File URL */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              File URL{" "}
              <span className="text-[10px] normal-case tracking-normal font-normal"
                style={{ color: "var(--text-muted)" }}
              >
                (optional)
              </span>
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={form.file_url}
              onChange={(e) => handleChange("file_url", e.target.value)}
              className="w-full px-3.5 py-2.5 text-[13px] rounded-lg border transition-all duration-200"
              style={inputStyle}
            />
          </div>
        </div>

        {/* ── Discount Rate Calculator ─────────────────────────────────── */}
        <div
          className="mt-6 rounded-lg p-5 animate-fade-in"
          style={{
            backgroundColor: "var(--accent-orange-bg)",
            border: "1px solid rgba(249, 115, 22, 0.15)",
          }}
        >
          {/* Section header */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center"
              style={{ backgroundColor: "rgba(249, 115, 22, 0.15)" }}
            >
              <Zap size={14} style={{ color: "var(--accent-orange)" }} />
            </div>
            <div>
              <h3
                className="text-[13px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Early Payment Discount
              </h3>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Slide to choose how soon you want to get paid
              </p>
            </div>
          </div>

          {/* Slider labels */}
          <div className="flex justify-between items-center mb-2">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-secondary)" }}
            >
              Payment Timeline
            </span>
            <span
              className="text-[13px] font-bold tabular-nums"
              style={{ color: "var(--accent-orange)" }}
            >
              {discountDays === 0 ? "Same-day" : `${discountDays} day${discountDays > 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Range slider */}
          <input
            type="range"
            min={0}
            max={MAX_DISCOUNT_DAYS}
            step={1}
            value={discountDays}
            onChange={(e) => setDiscountDays(Number(e.target.value))}
            className="clarity-slider w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              appearance: "none",
              background: `linear-gradient(to right, #0F172A 0%, #0F172A ${sliderFill}%, #E2E8F0 ${sliderFill}%, #E2E8F0 100%)`,
            }}
          />

          {/* Tick labels */}
          <div className="flex justify-between mt-1.5 px-0.5">
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              0 days
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              15 days
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              30 days
            </span>
          </div>

          {/* Dynamic result display */}
          {fullAmount > 0 && (
            <div
              className="mt-4 rounded-lg px-4 py-3 animate-fade-in"
              style={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--border)",
              }}
            >
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                Receive{" "}
                <span
                  className="font-bold text-[15px]"
                  style={{ color: "var(--accent-green)" }}
                >
                  {formatBDT(discountedAmount)}
                </span>{" "}
                today instead of{" "}
                <span
                  className="font-bold text-[15px]"
                  style={{ color: "var(--accent-green)" }}
                >
                  {formatBDT(fullAmount)}
                </span>{" "}
                in{" "}
                <span
                  className="font-bold text-[15px]"
                  style={{ color: "var(--accent-green)" }}
                >
                  {discountDays}
                </span>{" "}
                days
              </p>
              {discountPercent > 0 && (
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Platform discount: {discountPercent}% · You save{" "}
                  {formatBDT(fullAmount - discountedAmount)} in waiting time
                </p>
              )}
            </div>
          )}
        </div>

        {/* Feedback Toast */}
        {feedback && (
          <div
            className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium animate-fade-in"
            style={{
              backgroundColor:
                feedback.type === "success"
                  ? "var(--accent-green-bg)"
                  : "var(--accent-red-bg)",
              color:
                feedback.type === "success"
                  ? "var(--accent-green)"
                  : "var(--accent-red)",
            }}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {feedback.message}
          </div>
        )}

        {/* Submit */}
        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-[13px] font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            style={{
              backgroundColor: "#0F172A",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {loading ? "Submitting..." : "Submit Invoice"}
          </button>
        </div>
      </form>
    </div>
  );
}


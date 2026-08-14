"use client";

import InvoiceForm from "../components/InvoiceForm.jsx";

export default function InvoicesPage() {
  return (
    <div className="p-6 space-y-6">
      {/* ── Page Header ─────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-[26px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Discount Calculator
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Calculate and submit early payment discount requests.
          </p>
        </div>
      </div>

      {/* ── Invoice Upload Form with Discount Calculator ─────────────── */}
      <div className="max-w-3xl">
        <InvoiceForm onSuccess={() => {}} />
      </div>
    </div>
  );
}

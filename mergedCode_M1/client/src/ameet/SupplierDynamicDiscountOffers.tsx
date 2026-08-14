import { useEffect, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from "lucide-react";

type Offer = {
  id: number;
  invoice_id: string | number;
  buyer_name: string;
  discount_rate: string | number;
  platform_fee_rate: string | number;
  invoice_amount: string | number;
  discount_amount: string | number;
  supplier_payout: string | number;
  platform_fee: string | number;
  buyer_return: string | number;
  status: string;
  offered_at: string | null;
  responded_at: string | null;
  settled_at: string | null;
  invoice_number: string | null;
  supplier_id: string | null;
  due_date: string | null;
  invoice_status: string;
};

const API_URL = "";
const SUPPLIER_ID = "1";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toNumber(value: string | number | null | undefined) {
  return Number(value || 0);
}

function money(value: string | number | null | undefined) {
  return "BDT " + toNumber(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function dateText(value: string | null) {
  if (!value) return "-";
  const parts = value.split("-");
  return `${parts[2]} ${MONTHS[Number(parts[1]) - 1]} ${parts[0]}`;
}

function rateText(value: string | number) {
  return (toNumber(value) * 100).toFixed(2) + "%";
}

function statusClass(status: string) {
  if (status === "Accepted") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "Declined") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3" style={{ borderColor: "var(--border)" }}>
      <p className="text-[11px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-1 text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

export default function SupplierDynamicDiscountOffers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function loadOffers() {
    setLoading(true);
    setMessage("");

    fetch(API_URL + `/api/dynamic-discounting/offers?supplierId=${SUPPLIER_ID}`)
      .then((response) => response.json())
      .then((data) => {
        setOffers(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setMessage("Could not reach the server. Start the backend on port 5001.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadOffers();
  }, []);

  async function respondToOffer(id: number, action: "accept" | "decline") {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(API_URL + `/api/dynamic-discounting/offers/${id}/${action}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorName: "Supplier" }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not update offer.");
      }

      setMessage(action === "accept" ? "Offer accepted and early payment settled." : "Offer declined.");
      loadOffers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update offer.");
    } finally {
      setSaving(false);
    }
  }

  const openOffers = offers.filter((offer) => offer.status === "Offered");
  const totalOpenPayout = openOffers.reduce((sum, offer) => sum + toNumber(offer.supplier_payout), 0);
  const totalOpenDiscount = openOffers.reduce((sum, offer) => sum + toNumber(offer.discount_amount), 0);

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold" style={{ color: "var(--text-primary)" }}>
            Buyer-Funded Offers
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Review dynamic discounting offers sent by buyers.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOffers}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-[13px] font-semibold"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-lg border bg-white px-4 py-3 text-[13px]" style={{ borderColor: "var(--border)" }}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <Metric label="Open offers" value={String(openOffers.length)} />
        <Metric label="Potential payout" value={money(totalOpenPayout)} />
        <Metric label="Discount cost" value={money(totalOpenDiscount)} />
        <Metric label="All offers" value={String(offers.length)} />
      </div>

      <section className="rounded-lg border bg-white" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white">
            <Banknote size={18} />
          </span>
          <div>
            <h2 className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>
              Supplier Response Queue
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Accepting an offer settles buyer-funded early payment directly.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] uppercase" style={{ color: "var(--text-muted)" }}>
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Invoice Amount</th>
                <th className="px-4 py-3 text-right">Payout</th>
                <th className="px-4 py-3 text-right">Discount</th>
                <th className="px-4 py-3 text-right">Platform Fee</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && offers.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                    No buyer-funded early payment offers yet.
                  </td>
                </tr>
              )}
              {offers.map((offer) => (
                <tr key={offer.id} className="border-t" style={{ borderColor: "var(--border-light)" }}>
                  <td className="px-4 py-3 font-semibold">{offer.invoice_number || `INV-${offer.invoice_id}`}</td>
                  <td className="px-4 py-3">{offer.buyer_name}</td>
                  <td className="px-4 py-3">{dateText(offer.due_date)}</td>
                  <td className="px-4 py-3 text-right">{rateText(offer.discount_rate)}</td>
                  <td className="px-4 py-3 text-right">{money(offer.invoice_amount)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(offer.supplier_payout)}</td>
                  <td className="px-4 py-3 text-right">{money(offer.discount_amount)}</td>
                  <td className="px-4 py-3 text-right">{money(offer.platform_fee)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${statusClass(offer.status)}`}>
                      {offer.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={saving || offer.status !== "Offered"}
                        onClick={() => respondToOffer(offer.id, "accept")}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ borderColor: "#A7F3D0" }}
                      >
                        <CheckCircle2 size={14} />
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={saving || offer.status !== "Offered"}
                        onClick={() => respondToOffer(offer.id, "decline")}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ borderColor: "#FECDD3" }}
                      >
                        <XCircle size={14} />
                        Decline
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

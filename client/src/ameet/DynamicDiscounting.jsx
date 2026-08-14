import { useEffect, useMemo, useState } from "react";
import {
  CircleDollarSign,
  RefreshCw,
  Send,
} from "lucide-react";



const API_URL = "";
const DEFAULT_BUYER = "Apex Footwear Ltd";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toNumber(value) {
  return Number(value || 0);
}

function money(value) {
  return (
    "BDT " +
    toNumber(value).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })
  );
}

function dateText(value) {
  if (!value) return "-";

  const parts = value.split("-");

  if (parts.length !== 3) return value;

  return `${parts[2]} ${MONTHS[Number(parts[1]) - 1]} ${parts[0]}`;
}

function rateText(value) {
  return (toNumber(value) * 100).toFixed(2) + "%";
}

function statusClass(status) {
  if (status === "Accepted") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "Declined") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }

  return "bg-blue-50 text-blue-700 border-blue-200";
}

function Metric({
  label,
  value,
}) {
  return (
    <div
      className="rounded-lg border bg-white px-4 py-3"
      style={{ borderColor: "var(--border)" }}
    >
      <p
        className="text-[11px] font-semibold uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>

      <p
        className="mt-1 text-[18px] font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

function responseDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DynamicDiscounting() {
  const [eligible, setEligible] = useState([]);
  const [offers, setOffers] = useState([]);

  const [selected, setSelected] = useState([]);

  const [buyerName, setBuyerName] = useState(DEFAULT_BUYER);
  const [discountRate, setDiscountRate] = useState(3);

  const [loading, setLoading] = useState(true);
  const [offersLoading, setOffersLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");

  const selectedInvoices = useMemo(
    () =>
      eligible.filter((invoice) =>
        selected.includes(invoice.id)
      ),
    [eligible, selected]
  );

  const offerPreview = useMemo(() => {
    const invoiceAmount = selectedInvoices.reduce(
      (sum, invoice) =>
        sum + toNumber(invoice.invoice_amount),
      0
    );

    const discountAmount =
      invoiceAmount * (discountRate / 100);

    const platformFee = invoiceAmount * 0.005;

    return {
      invoiceAmount,
      supplierPayout: invoiceAmount - discountAmount,
      buyerReturn: discountAmount - platformFee,
      platformFee,
    };
  }, [selectedInvoices, discountRate]);

  function loadData() {
    setLoading(true);
    setMessage("");

    fetch(
      API_URL +
        "/api/dynamic-discounting/eligible-invoices"
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Could not load eligible invoices."
          );
        }

        return response.json();
      })
      .then((eligibleData) => {
        setEligible(
          Array.isArray(eligibleData)
            ? eligibleData
            : []
        );
      })
      .catch(() => {
        setMessage(
          "Could not reach the server. Start the backend on port 5001."
        );
      })
      .finally(() => setLoading(false));
  }

  function loadOffers() {
    setOffersLoading(true);

    fetch(
      API_URL +
        `/api/dynamic-discounting/offers?buyerName=${encodeURIComponent(
          buyerName
        )}`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Could not load supplier responses."
          );
        }

        return response.json();
      })
      .then((data) => {
        setOffers(
          Array.isArray(data) ? data : []
        );
      })
      .catch(() => {
        setMessage(
          "Could not load supplier responses."
        );
      })
      .finally(() => {
        setOffersLoading(false);
      });
  }

  useEffect(() => {
    loadData();
    loadOffers();
  }, []);

  function toggleInvoice(id) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  async function createOffers() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        API_URL +
          "/api/dynamic-discounting/offers",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            buyerName,
            invoiceIds: selected,
            discountRate: discountRate / 100,
            platformFeeRate: 0.005,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Could not create offers."
        );
      }

      setSelected([]);

      setMessage(
        `${data.offers.length} discount offer(s) sent to suppliers.`
      );

      loadData();
      loadOffers();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create offers."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1
            className="text-[26px] font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Dynamic Discounting
          </h1>

          <p
            className="text-[13px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Buyer-funded early payment for confirmed invoices.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            loadData();
            loadOffers();
          }}
          disabled={loading || offersLoading}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <RefreshCw
            size={15}
            className={
              loading || offersLoading
                ? "animate-spin"
                : ""
            }
          />
          Refresh
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className="rounded-lg border bg-white px-4 py-3 text-[13px]"
          style={{ borderColor: "var(--border)" }}
        >
          {message}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <Metric
          label="Selected invoices"
          value={String(selected.length)}
        />

        <Metric
          label="Invoice value"
          value={money(offerPreview.invoiceAmount)}
        />

        <Metric
          label="Supplier payout"
          value={money(offerPreview.supplierPayout)}
        />

        <Metric
          label="Buyer net return"
          value={money(offerPreview.buyerReturn)}
        />
      </div>

      {/* Buyer Offer Desk */}
      <section
        className="rounded-lg border bg-white"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex flex-wrap items-end justify-between gap-3 border-b p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <CircleDollarSign size={18} />
            </span>

            <div>
              <h2
                className="text-[16px] font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Buyer Offer Desk
              </h2>

              <p
                className="text-[12px]"
                style={{ color: "var(--text-secondary)" }}
              >
                Select eligible confirmed invoices and set
                the early-payment discount.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label
              className="grid gap-1 text-[12px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Buyer

              <input
                value={buyerName}
                onChange={(event) =>
                  setBuyerName(event.target.value)
                }
                className="h-9 w-[210px] rounded-lg border px-3 text-[13px] font-medium"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            </label>

            <label
              className="grid gap-1 text-[12px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Discount rate

              <input
                type="number"
                min={0.1}
                max={20}
                step={0.1}
                value={discountRate}
                onChange={(event) =>
                  setDiscountRate(
                    Number(event.target.value)
                  )
                }
                className="h-9 w-[120px] rounded-lg border px-3 text-[13px] font-medium"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            </label>

            <button
              type="button"
              disabled={
                saving || selected.length === 0
              }
              onClick={createOffers}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Send size={15} />
              Send offers
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead
              className="bg-slate-50 text-[11px] uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              <tr>
                <th className="w-12 px-4 py-3"></th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-right">
                  Amount
                </th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">
                  Buyer Return
                </th>
                <th className="px-4 py-3 text-right">
                  Supplier Payout
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && eligible.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center"
                    style={{
                      color: "var(--text-secondary)",
                    }}
                  >
                    No confirmed invoices are currently
                    eligible.
                  </td>
                </tr>
              )}

              {eligible.map((invoice) => {
                const amount = toNumber(
                  invoice.invoice_amount
                );

                const discount =
                  amount * (discountRate / 100);

                const fee = amount * 0.005;

                return (
                  <tr
                    key={invoice.id}
                    className="border-t"
                    style={{
                      borderColor:
                        "var(--border-light)",
                    }}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(
                          invoice.id
                        )}
                        onChange={() =>
                          toggleInvoice(invoice.id)
                        }
                        className="h-4 w-4"
                      />
                    </td>

                    <td className="px-4 py-3 font-semibold">
                      {invoice.invoice_number ||
                        `INV-${invoice.id}`}
                    </td>

                    <td className="px-4 py-3">
                      {invoice.buyer_name || "-"}
                    </td>

                    <td className="px-4 py-3">
                      {invoice.supplier_id || "-"}
                    </td>

                    <td className="px-4 py-3 text-right font-semibold">
                      {money(amount)}
                    </td>

                    <td className="px-4 py-3">
                      {dateText(invoice.due_date)}
                    </td>

                    <td className="px-4 py-3 text-right text-emerald-700">
                      {money(discount - fee)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {money(amount - discount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Supplier Response Queue */}
      <section
        className="rounded-lg border bg-white"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between border-b p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2
              className="text-[16px] font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Supplier Response Queue
            </h2>

            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Track the status of buyer-funded early
              payment offers sent to suppliers.
            </p>
          </div>

          <button
            type="button"
            onClick={loadOffers}
            disabled={offersLoading}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          >
            <RefreshCw
              size={15}
              className={
                offersLoading ? "animate-spin" : ""
              }
            />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-[13px]">
            <thead
              className="bg-slate-50 text-[11px] uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">
                  Discount Rate
                </th>
                <th className="px-4 py-3 text-right">
                  Invoice Amount
                </th>
                <th className="px-4 py-3 text-right">
                  Supplier Payout
                </th>
                <th className="px-4 py-3 text-right">
                  Buyer Return
                </th>
                <th className="px-4 py-3">
                  Status
                </th>
                <th className="px-4 py-3">
                  Responded
                </th>
              </tr>
            </thead>

            <tbody>
              {!offersLoading &&
                offers.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-8 text-center"
                      style={{
                        color:
                          "var(--text-secondary)",
                      }}
                    >
                      No supplier responses yet.
                    </td>
                  </tr>
                )}

              {offers.map((offer) => (
                <tr
                  key={offer.id}
                  className="border-t"
                  style={{
                    borderColor:
                      "var(--border-light)",
                  }}
                >
                  <td className="px-4 py-3 font-semibold">
                    {offer.invoice_number ||
                      `INV-${offer.invoice_id}`}
                  </td>

                  <td className="px-4 py-3">
                    {offer.supplier_id || "-"}
                  </td>

                  <td className="px-4 py-3">
                    {dateText(offer.due_date)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {rateText(
                      offer.discount_rate
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {money(
                      offer.invoice_amount
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-semibold">
                    {money(
                      offer.supplier_payout
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-emerald-700">
                    {money(
                      offer.buyer_return
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${statusClass(
                        offer.status
                      )}`}
                    >
                      {offer.status}
                    </span>
                  </td>

                  <td
                    className="px-4 py-3"
                    style={{
                      color:
                        "var(--text-secondary)",
                    }}
                  >
                    {responseDate(
                      offer.responded_at
                    )}
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
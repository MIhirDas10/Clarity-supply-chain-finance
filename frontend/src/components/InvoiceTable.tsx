"use client";

import StatusBadge from "./StatusBadge";
import { FileText, ExternalLink } from "lucide-react";

export interface Invoice {
  id: number;
  supplier_id: string;
  buyer_name: string;
  invoice_number: string;
  amount: string | number;
  due_date: string;
  file_url: string | null;
  status: string;
  created_at: string;
}

interface InvoiceTableProps {
  invoices: Invoice[];
  loading: boolean;
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `৳ ${num.toLocaleString("en-IN")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Skeleton row for loading state
function SkeletonRow() {
  return (
    <tr>
      {[...Array(7)].map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div
            className="h-4 rounded-md animate-skeleton"
            style={{
              backgroundColor: "#E2E8F0",
              width: i === 3 ? "90px" : i === 5 ? "70px" : "110px",
            }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function InvoiceTable({ invoices, loading }: InvoiceTableProps) {
  return (
    <div
      className="rounded-xl overflow-hidden animate-fade-in"
      style={{
        backgroundColor: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--border-light)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "var(--accent-blue-bg)" }}
          >
            <FileText size={18} style={{ color: "var(--accent-blue)" }} />
          </div>
          <div>
            <h2
              className="text-[16px] font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Invoice Monitoring
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {loading ? "Loading..." : `${invoices.length} total invoices`}
            </p>
          </div>
        </div>
        <button
          className="text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors duration-200 cursor-pointer"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#F8FAFC";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          View All
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: "#F8FAFC" }}>
              {[
                "Invoice #",
                "Supplier",
                "Buyer",
                "Amount",
                "Due Date",
                "Status",
                "Action",
              ].map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-muted)" }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-[13px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  No invoices found. Submit your first invoice above.
                </td>
              </tr>
            ) : (
              invoices.map((inv, index) => (
                <tr
                  key={inv.id}
                  className="border-t transition-colors duration-150"
                  style={{
                    borderColor: "var(--border-light)",
                    animationDelay: `${index * 50}ms`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#F8FAFC";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <td
                    className="px-4 py-3.5 text-[13px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    #{inv.invoice_number}
                  </td>
                  <td
                    className="px-4 py-3.5 text-[13px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {inv.supplier_id}
                  </td>
                  <td
                    className="px-4 py-3.5 text-[13px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {inv.buyer_name}
                  </td>
                  <td
                    className="px-4 py-3.5 text-[13px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {formatCurrency(inv.amount)}
                  </td>
                  <td
                    className="px-4 py-3.5 text-[13px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {formatDate(inv.due_date)}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    {inv.file_url ? (
                      <a
                        href={inv.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors duration-200"
                        style={{
                          color: "var(--accent-blue)",
                          backgroundColor: "var(--accent-blue-bg)",
                        }}
                      >
                        <ExternalLink size={12} />
                        View
                      </a>
                    ) : (
                      <span
                        className="text-[12px] px-2.5 py-1 rounded-md inline-block"
                        style={{
                          color: "var(--text-muted)",
                          backgroundColor: "#F1F5F9",
                        }}
                      >
                        No file
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

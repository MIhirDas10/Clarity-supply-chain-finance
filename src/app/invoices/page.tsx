"use client";

import { useState, useEffect, useCallback, useReducer } from "react";
import {
  FileText,
  TrendingUp,
  Clock,
  AlertTriangle,
  RefreshCw,
  Download,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import InvoiceForm from "@/components/InvoiceForm";
import InvoiceTable, { type Invoice } from "@/components/InvoiceTable";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  // Incrementing a counter triggers a re-fetch without calling setState in the effect body
  const [refreshKey, triggerRefresh] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/invoices");
        const data = await res.json();
        if (!cancelled) setInvoices(data.invoices ?? []);
      } catch (error) {
        console.error("Failed to fetch invoices:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleRefresh = useCallback(() => {
    triggerRefresh();
  }, []);

  // Computed stats
  const totalValue = invoices.reduce(
    (sum, inv) =>
      sum + (typeof inv.amount === "string" ? parseFloat(inv.amount) : inv.amount),
    0
  );
  const pendingCount = invoices.filter((i) => i.status === "Pending").length;
  const confirmedCount = invoices.filter((i) => i.status === "Confirmed").length;

  return (
    <div className="p-6 space-y-6">
      {/* ── Page Header ─────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-[26px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            My Invoices
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Manage and track all submitted invoices.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-[13px] font-medium transition-colors duration-200 cursor-pointer"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-secondary)",
              backgroundColor: "var(--card-bg)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F8FAFC";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--card-bg)";
            }}
          >
            <Download size={15} />
            Export Report
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-all duration-200 hover:brightness-110 active:scale-[0.97] cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #1E293B, #334155)",
            }}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* ── Stat Cards ──────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Total Invoices"
          value={invoices.length.toString()}
          change="+12.5%"
          changeType="positive"
          borderColor="var(--accent-green)"
          iconBg="var(--accent-green-bg)"
          iconColor="var(--accent-green)"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Value"
          value={`৳ ${totalValue.toLocaleString("en-IN")}`}
          change="+4.2%"
          changeType="positive"
          borderColor="var(--accent-blue)"
          iconBg="var(--accent-blue-bg)"
          iconColor="var(--accent-blue)"
        />
        <StatCard
          icon={Clock}
          label="Pending"
          value={pendingCount.toString()}
          borderColor="var(--accent-orange)"
          iconBg="var(--accent-orange-bg)"
          iconColor="var(--accent-orange)"
        />
        <StatCard
          icon={AlertTriangle}
          label="Confirmed"
          value={confirmedCount.toString()}
          borderColor="var(--accent-teal)"
          iconBg="var(--accent-teal-bg)"
          iconColor="var(--accent-teal)"
        />
      </div>

      {/* ── Invoice Upload Form ─────────────── */}
      <InvoiceForm onSuccess={handleRefresh} />

      {/* ── Invoice Data Table ──────────────── */}
      <InvoiceTable invoices={invoices} loading={loading} />
    </div>
  );
}

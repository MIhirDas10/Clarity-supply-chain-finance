"use client";

import { Bell, Search, Grid3X3 } from "lucide-react";

export default function Header() {
  return (
    <header className="h-[60px] flex items-center justify-between px-6 border-b"
      style={{
        backgroundColor: "var(--card-bg)",
        borderColor: "var(--border)",
      }}
    >
      {/* ── Search ────────────────────────────── */}
      <div className="relative w-full max-w-[320px]">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          placeholder="Search..."
          className="w-full pl-9 pr-4 py-2 text-[13px] rounded-lg border transition-colors duration-200"
          style={{
            backgroundColor: "#F8FAFC",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* ── Right Actions ─────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button className="relative p-2 rounded-lg transition-colors duration-200 cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F1F5F9")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <Bell size={19} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ backgroundColor: "var(--accent-red)" }}
          />
        </button>

        {/* Grid */}
        <button className="p-2 rounded-lg transition-colors duration-200 cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F1F5F9")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <Grid3X3 size={19} />
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ml-1 cursor-pointer"
          style={{ backgroundColor: "#0F172A" }}
        >
          A
        </div>
      </div>
    </header>
  );
}

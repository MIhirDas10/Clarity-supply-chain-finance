"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bell, Search, Plus, Download, ChevronDown, Sparkles } from "lucide-react";

export default function Header() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => {
        let count = 0;
        if (Array.isArray(data)) {
          for (let i = 0; i < data.length; i++) {
            if (!data[i].is_read) {
              count = count + 1;
            }
          }
        }
        setUnreadCount(count);
      })
      .catch((err) => {
        console.error(err);
      });
  }, []);

  return (
    <header
      className="h-[64px] flex items-center justify-between px-6 border-b z-20 transition-colors duration-200"
      style={{
        backgroundColor: "#12131A",
        borderColor: "var(--border)",
      }}
    >
      {/* ── Search Bar with ⌘K Shortcut ────────────────────────────── */}
      <div className="relative w-full max-w-[340px]">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          placeholder="Search Anything..."
          className="w-full pl-10 pr-12 py-2 text-[13px] rounded-lg border transition-colors duration-200 focus:outline-none"
          style={{
            backgroundColor: "#191B26",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-1.5 py-0.5 rounded border"
          style={{
            backgroundColor: "#222534",
            borderColor: "#2E3246",
            color: "var(--text-muted)",
          }}
        >
          ⌘K
        </span>
      </div>

      {/* ── Right Actions ─────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Quick Action: Add */}
        <button
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all duration-200 hover:bg-[#1E202D] cursor-pointer"
          style={{
            backgroundColor: "#191B26",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <span>Add</span>
          <Plus size={14} />
        </button>

        {/* Quick Action: Export */}
        <button
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all duration-200 hover:bg-[#1E202D] cursor-pointer"
          style={{
            backgroundColor: "#191B26",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <Download size={14} style={{ color: "var(--text-muted)" }} />
          <span>Export</span>
        </button>

        {/* Quick Action: New Dropdown */}
        <button
          className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-medium text-white transition-all duration-200 hover:opacity-90 cursor-pointer shadow-sm"
          style={{
            backgroundColor: "#8B5CF6",
          }}
        >
          <Sparkles size={14} />
          <span>New</span>
          <ChevronDown size={14} />
        </button>

        <div className="h-4 w-[1px] bg-[#232636] mx-1 hidden sm:block"></div>

        {/* Notification bell */}
        <Link
          to="/notifications"
          className="relative p-2 rounded-lg transition-colors duration-200 cursor-pointer hover:bg-[#1E202D]"
          style={{ color: "var(--text-secondary)" }}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow"
              style={{ backgroundColor: "var(--accent-red)" }}
            >
              {unreadCount}
            </span>
          )}
        </Link>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold cursor-pointer border border-[#2A2D3E] shadow-sm"
          style={{ backgroundColor: "#8B5CF6" }}
        >
          SA
        </div>
      </div>
    </header>
  );
}

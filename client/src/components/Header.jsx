"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bell, Search, Grid3X3 } from "lucide-react";

export default function Header() {
  const [unreadCount, setUnreadCount] = useState(0);

  // When the header loads, fetch the notifications and count the unread ones.
  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => {
        let count = 0;
        for (let i = 0; i < data.length; i++) {
          if (!data[i].is_read) {
            count = count + 1;
          }
        }
        setUnreadCount(count);
      })
      .catch((err) => {
        console.error(err);
      });
  }, []);

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
        {/* Notification bell - opens the Notifications page */}
        <Link to="/notifications" className="relative p-2 rounded-lg transition-colors duration-200 cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F1F5F9")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <Bell size={19} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ backgroundColor: "var(--accent-red)" }}
            >
              {unreadCount}
            </span>
          )}
        </Link>

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

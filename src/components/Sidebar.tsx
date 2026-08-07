"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Upload,
  FileText,
  TrendingUp,
  Clock,
  Bell,
  Settings,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Upload Invoice", href: "/upload", icon: Upload },
  { label: "My Invoices", href: "/invoices", icon: FileText },
  { label: "Cash Flow", href: "/cashflow", icon: TrendingUp },
  { label: "Payout History", href: "/payouts", icon: Clock },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[250px] flex flex-col z-30"
      style={{ backgroundColor: "var(--sidebar-bg)" }}
    >
      {/* ── Logo ──────────────────────────────── */}
      <div className="px-5 pt-5 pb-2">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
            style={{ background: "linear-gradient(135deg, #F97316, #FB923C)" }}
          >
            C
          </div>
          <span className="text-white font-semibold text-[15px] tracking-tight">
            Clarity B2B
          </span>
        </div>
        <div className="mt-1">
          <p className="text-[11px] font-medium" style={{ color: "#94A3B8" }}>
            Supplier Portal
          </p>
          <p className="text-[10px]" style={{ color: "#64748B" }}>
            Enterprise Account
          </p>
        </div>
      </div>

      {/* ── CTA Button ────────────────────────── */}
      <div className="px-4 py-3">
        <button className="w-full py-2.5 rounded-lg text-white text-[13px] font-medium transition-all duration-200 hover:brightness-110 active:scale-[0.97] cursor-pointer"
          style={{ background: "linear-gradient(135deg, #F97316, #EA580C)" }}
        >
          + New Discount Request
        </button>
      </div>

      {/* ── Navigation ────────────────────────── */}
      <nav className="flex-1 px-3 mt-1 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === "/invoices" && pathname === "/") ||
            (item.href === "/" && pathname === "/invoices");

          return (
            <Link
              key={item.href}
              href={item.href === "/" ? "/invoices" : item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium
                transition-all duration-200 group relative
                ${isActive
                  ? "text-white"
                  : "hover:text-white"
                }
              `}
              style={{
                color: isActive ? "#FFFFFF" : "#94A3B8",
                backgroundColor: isActive ? "var(--sidebar-hover)" : "transparent",
              }}
            >
              {/* Orange active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                  style={{ backgroundColor: "var(--sidebar-active)" }}
                />
              )}
              <item.icon size={18} strokeWidth={isActive ? 2 : 1.5}
                style={{ color: isActive ? "#F97316" : undefined }}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom ────────────────────────────── */}
      <div className="px-5 py-4 border-t" style={{ borderColor: "#2D3548" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
            style={{ background: "linear-gradient(135deg, #3B82F6, #6366F1)" }}
          >
            SA
          </div>
          <div>
            <p className="text-[12px] font-medium text-white leading-tight">
              Supply Admin
            </p>
            <p className="text-[10px]" style={{ color: "#64748B" }}>
              admin@clarity.io
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

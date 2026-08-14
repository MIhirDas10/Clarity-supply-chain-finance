import { NavLink } from "react-router-dom";
import {
  Activity,
  Upload,
  Zap,
  FileText,
  Clock,
  TrendingUp,
  Banknote,
  Bell,
  Settings,
} from "lucide-react";

// One sidebar for the whole platform. Each "built" item routes to a feature a
// group member owns; the rest are honest placeholders for work not done yet.
const navItems = [
  { label: "Upload Invoice", to: "/upload", icon: Upload, built: true },           // Apurba
  { label: "Discount Calculator", to: "/discount", icon: Zap, built: true },       // Digonto
  { label: "My Invoices", to: "/my-invoices", icon: FileText, built: true },       // Apurba
  { label: "Invoice Pipeline", to: "/pipeline", icon: Activity, built: true },     // Mihir
  { label: "Payout History", to: "/payouts", icon: Clock, built: true },           // Apurba
  { label: "Cash Flow", to: "/cashflow", icon: TrendingUp, built: true },            // Ameet
  { label: "Buyer-Funded Offers", to: "/buyer-funded-offers", icon: Banknote, built: true },
  { label: "Notifications", to: "/notifications", icon: Bell, built: false },
  { label: "Settings", to: "/settings", icon: Settings, built: false },
];

export default function Sidebar() {
  return (
    <aside
      className="fixed left-0 top-0 bottom-0 w-[250px] flex flex-col z-30 border-r"
      style={{ backgroundColor: "var(--sidebar-bg)", borderColor: "var(--border)" }}
    >
      {/* Logo */}
      <div className="px-5 pt-5 pb-2">
        <div className="flex items-center gap-2.5 mb-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
            style={{ backgroundColor: "#0F172A" }}
          >
            C
          </div>
          <span
            className="font-semibold text-[15px] tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
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

      {/* CTA */}
      <div className="px-4 py-3">
        <button
          className="w-full py-2.5 rounded-lg text-white text-[13px] font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.97] cursor-pointer"
          style={{ backgroundColor: "#0F172A" }}
        >
          New Discount Request
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 mt-1 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200"
            style={({ isActive }) => ({
              color: isActive ? "#FFFFFF" : "var(--text-secondary)",
              backgroundColor: isActive ? "var(--sidebar-active)" : "transparent",
              opacity: item.built ? 1 : 0.55,
            })}
          >
            {({ isActive }) => (
              <>
                <item.icon
                  size={18}
                  strokeWidth={isActive ? 2 : 1.5}
                  style={{ color: isActive ? "#FFFFFF" : "var(--text-secondary)" }}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
            style={{ backgroundColor: "var(--text-primary)" }}
          >
            SA
          </div>
          <div>
            <p
              className="text-[12px] font-medium leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
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

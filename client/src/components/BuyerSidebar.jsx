import { NavLink } from "react-router-dom";
import {
  Activity,
  CircleDollarSign,
  FileCheck2,
  ShieldAlert,
  LogOut,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";

const buyerItems = [
  { label: "Supplier Health & Distress-Signal Analytics", icon: Activity, built: false },
  { label: "Invoice Confirmation & Digital Acknowledgment Workflow", icon: FileCheck2, built: false },
  { label: "Dispute Filing & Invoice Freeze", icon: ShieldAlert, built: false },
  {
    label: "Dynamic Discounting",
    to: "/buyer/dynamic-discounting",
    icon: CircleDollarSign,
    built: true,
  },
];

export default function BuyerSidebar() {
  const { user, logout } = useAuth();
  const initials = (user?.business_name || "Buyer")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 w-[250px] flex flex-col z-30 border-r"
      style={{ backgroundColor: "var(--sidebar-bg)", borderColor: "var(--border)" }}
    >
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
            Buyer Portal
          </p>
          <p className="text-[10px]" style={{ color: "#64748B" }}>
            Corporate Payables
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        <button
          className="w-full py-2.5 rounded-lg text-white text-[13px] font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.97] cursor-pointer"
          style={{ backgroundColor: "#0F172A" }}
        >
          New Buyer Offer
        </button>
      </div>

      <nav className="flex-1 px-3 mt-1 space-y-0.5 overflow-y-auto">
        {buyerItems.map((item) => {
          if (!item.built) {
            return (
              <button
                key={item.label}
                type="button"
                disabled
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[13px] font-medium"
                style={{ color: "var(--text-secondary)", opacity: 0.55 }}
              >
                <item.icon size={18} strokeWidth={1.5} />
                <span className="leading-tight">{item.label}</span>
              </button>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200"
              style={({ isActive }) => ({
                color: isActive ? "#FFFFFF" : "var(--text-secondary)",
                backgroundColor: isActive ? "var(--sidebar-active)" : "transparent",
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
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
            style={{ backgroundColor: "var(--text-primary)" }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-[12px] font-medium leading-tight truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {user?.business_name || "Buyer"}
            </p>
            <p className="text-[10px] truncate" style={{ color: "#64748B" }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="p-1.5 rounded-md cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

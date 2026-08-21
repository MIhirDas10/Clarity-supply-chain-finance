import { NavLink } from "react-router-dom";
import { Activity, Bell, BriefcaseBusiness, CalendarDays, FolderLock, Landmark, LogOut, Settings, Sparkles, Store, Wallet } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";

const funderItems = [
 { label: "Portfolio", to: "/funder/portfolio", icon: BriefcaseBusiness },
 { label: "Repayment & Settlement", to: "/funder/settlements", icon: Landmark },
 { label: "Repayment Calendar", to: "/funder/calendar", icon: CalendarDays },
 { label: "Marketplace", to: "/funder/marketplace", icon: Store },
 { label: "Buyer Credit", to: "/funder/credit", icon: Activity },
 { label: "Document Vault", to: "/funder/vault", icon: FolderLock },
 { label: "Funder Wallet", to: "/funder/wallet", icon: Wallet },
 { label: "Auto-Invest Rules", to: "/funder/auto-invest", icon: Sparkles },
 { label: "Settings", to: "/funder/settings", icon: Settings, built: false },
];

export default function FunderSidebar() {
 const { user, logout } = useAuth();
 const initials = (user?.business_name || "Funder")
 .split(" ")
 .map((word) => word[0])
 .slice(0, 2)
 .join("")
 .toUpperCase();

 return (
 <aside className="fixed left-0 top-0 bottom-0 w-[250px] flex flex-col z-30 border-r" style={{ backgroundColor: "var(--sidebar-bg)", borderColor: "var(--border)" }}>
 <div className="px-5 pt-5 pb-2">
 <div className="flex items-center gap-2.5 mb-1">
 <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm" style={{ backgroundColor: "#0F172A" }}>C</div>
 <span className="font-semibold text-[15px] tracking-tight" style={{ color: "var(--text-primary)" }}>Clarity B2B</span>
 </div>
 <div className="mt-1">
 <p className="text-[11px] font-medium" style={{ color: "#94A3B8" }}>Funder Portal</p>
 <p className="text-[10px]" style={{ color: "#64748B" }}>Investment Account</p>
 </div>
 </div>

 <div className="px-4 py-3">
 <button className="w-full py-2.5 rounded-lg text-white text-[13px] font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.97] cursor-pointer" style={{ backgroundColor: "#0F172A" }}>
 <Landmark size={15} className="inline mr-2" />
 Fund an Invoice
 </button>
 </div>

 <nav className="flex-1 px-3 mt-1 space-y-0.5 overflow-y-auto">
 {funderItems.map((item) => (
 item.built === false ? (
 <button key={item.to} type="button" disabled className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-[13px] font-medium" style={{ color: "var(--text-secondary)", opacity: 0.55 }}>
 <item.icon size={18} strokeWidth={1.5} />
 {item.label}
 </button>
 ) : (
 <NavLink key={item.to} to={item.to} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200" style={({ isActive }) => ({ color: isActive ? "#FFFFFF" : "var(--text-secondary)", backgroundColor: isActive ? "var(--sidebar-active)" : "transparent" })}>
 {({ isActive }) => (
 <>
 <item.icon size={18} strokeWidth={isActive ? 2 : 1.5} />
 {item.label}
 </>
 )}
 </NavLink>
 )
 ))}
 </nav>

 <div className="px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
 <div className="flex items-center gap-2.5">
 <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium" style={{ backgroundColor: "var(--text-primary)" }}>{initials}</div>
 <div className="flex-1 min-w-0">
 <p className="text-[12px] font-medium leading-tight truncate" style={{ color: "var(--text-primary)" }}>{user?.business_name || "Funder"}</p>
 <p className="text-[10px] truncate" style={{ color: "#64748B" }}>{user?.email}</p>
 </div>
 <button onClick={logout} title="Log out" className="p-1.5 rounded-md cursor-pointer" style={{ color: "var(--text-secondary)" }}><LogOut size={15} /></button>
 </div>
 </div>
 </aside>
 );
}
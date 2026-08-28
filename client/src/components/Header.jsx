"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bell, LogOut, Menu } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export default function Header({ onMenuClick }) {
 const [unreadCount, setUnreadCount] = useState(0);
 const { user, logout } = useAuth();
 
  useEffect(() => {
    if (user?.is_paused) return;
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
 <header className="h-[64px] flex items-center justify-between px-4 lg:px-6 bg-white border-b border-slate-200 z-20">
 <div className="flex items-center gap-3 flex-1">
    <button type="button" onClick={onMenuClick} aria-label="Open menu" className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">
     <Menu size={20} />
   </button>
 </div>
 {/* ── Right Actions ──────────────────────────────────────────── */}
 <div className="flex items-center gap-2">
 {/* Notification bell */}
 {user?.role === "supplier" && (
 <Link
 to="/notifications"
 className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
 >
 <Bell size={20} />
 {unreadCount > 0 && (
 <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold text-white bg-red-500 flex items-center justify-center shadow">
 {unreadCount}
 </span>
 )}
 </Link>
 )}

 {/* Logout button */}
 <button 
 onClick={logout}
 title="Log out"
 className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
 >
 <LogOut size={20} />
 </button>

 {/* Avatar */}
 <div className="ml-1 w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center text-white text-sm font-semibold cursor-pointer">
 {user?.name?.[0]?.toUpperCase() || 'U'}
 </div>
 </div>
 </header>
 );
}

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Smartphone,
  QrCode,
  ArrowLeftRight,
  KeyRound,
  Webhook,
  BookOpen,
  Settings,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

const navigationItems = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Koneksi GoBiz", href: "/dashboard/connections/gobiz", icon: Smartphone },
  { name: "QRIS Payments", href: "/dashboard/payments", icon: QrCode },
  { name: "Transaksi", href: "/dashboard/transactions", icon: ArrowLeftRight },
  { name: "API Keys", href: "/dashboard/api-keys", icon: KeyRound },
  { name: "Webhooks", href: "/dashboard/webhooks", icon: Webhook },
  { name: "Dokumentasi API", href: "/dashboard/docs", icon: BookOpen },
  { name: "Pengaturan", href: "/dashboard/settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0 min-h-screen text-slate-300 select-none">
      {/* Brand logo & header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800">
        <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold text-white text-sm tracking-tight leading-tight">QRIS Gateway</div>
          <div className="text-[10px] text-indigo-400 font-mono font-medium">GOBIZ INTEGRATED</div>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Menu Utama
        </div>
        {navigationItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sandbox badge & footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-300">Environment</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono font-semibold">
              SANDBOX
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Mode pengujian aktif. Transaksi & QRIS berjalan aman dalam sandbox.
          </p>
        </div>
      </div>
    </aside>
  );
}

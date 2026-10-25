"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Bell, Shield, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function DashboardTopbar({
  userEmail = "merchant@demo.local",
  displayName = "Merchant Admin",
}: {
  userEmail?: string;
  displayName?: string;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {}
    router.push("/login");
  };

  const handleQuickSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/auth/gobiz/sync", { method: "POST" });
      router.refresh();
    } catch {
    } finally {
      setTimeout(() => setSyncing(false), 800);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left title & quick sync */}
      <div className="flex items-center gap-4">
        <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100/80">
          QRIS Engine v1.0
        </span>
        <button
          onClick={handleQuickSync}
          disabled={syncing}
          title="Sinkronisasi manual transaksi GoBiz"
          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 px-2.5 py-1 rounded-md border border-slate-200 hover:border-indigo-200 bg-slate-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-indigo-600" : ""}`} />
          <span>{syncing ? "Menyinkronkan..." : "Sync Transaksi"}</span>
        </button>
      </div>

      {/* Right User & Actions */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 pr-2 border-r border-slate-200">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-semibold text-slate-800 leading-tight">{displayName}</div>
            <div className="text-[11px] text-slate-500">{userEmail}</div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-rose-600 font-medium px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
          title="Keluar dari sesi dashboard"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Keluar</span>
        </button>
      </div>
    </header>
  );
}

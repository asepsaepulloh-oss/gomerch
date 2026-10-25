import React from "react";
import { Settings, Shield, Clock, Database, User, Globe } from "lucide-react";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";

export default async function SettingsPage() {
  const user = await getDashboardSessionUser();
  const ownerId = user?.id || "usr_demo_dashboard_owner";

  const auditLogs = await db.audit.list(ownerId, 20);
  const connection = await db.connections.getByOwnerId(ownerId);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pengaturan & Audit Keamanan</h1>
        <p className="text-sm text-slate-500 mt-1">
          Kelola profil merchant, preferensi lingkungan (environment), dan audit log aktivitas sistem.
        </p>
      </div>

      {/* Profile & Organization */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-600" />
          Profil Merchant
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400">Nama Pengguna:</span>
            <div className="font-semibold text-slate-900 mt-1">{user?.displayName || "Merchant Admin"}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400">Email Terdaftar:</span>
            <div className="font-semibold text-slate-900 mt-1">{user?.email || "merchant@demo.local"}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400">Zona Waktu Default:</span>
            <div className="font-semibold text-slate-900 mt-1">Asia/Jakarta (WIB, UTC+7)</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400">Mata Uang Transaksi:</span>
            <div className="font-semibold text-slate-900 mt-1">IDR (Rupiah Indonesia)</div>
          </div>
        </div>
      </div>

      {/* Security & Cryptography Parameters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-600" />
          Parameter Enkripsi Kriptografis
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
            <span className="text-emerald-700 font-semibold">Algoritma Enkripsi</span>
            <div className="font-mono text-slate-900 font-bold text-sm mt-1">AES-256-GCM</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Authenticated Cipher</div>
          </div>
          <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
            <span className="text-emerald-700 font-semibold">Inisialisasi Vector (IV)</span>
            <div className="font-mono text-slate-900 font-bold text-sm mt-1">96-bit (12 bytes)</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Acak & tidak pernah diulang</div>
          </div>
          <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
            <span className="text-emerald-700 font-semibold">Signature Webhook</span>
            <div className="font-mono text-slate-900 font-bold text-sm mt-1">HMAC-SHA256</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Constant-time verification</div>
          </div>
        </div>
      </div>

      {/* Audit Log Activity */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            Audit Log Aktivitas Terakhir
          </h2>
          <span className="text-[11px] text-slate-400">Pencatatan real-time aksi sensitif</span>
        </div>

        {auditLogs.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4">Belum ada aktivitas tercatat.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 text-slate-400 font-semibold uppercase">
                <tr>
                  <th className="pb-2">Waktu</th>
                  <th className="pb-2">Aksi</th>
                  <th className="pb-2">Rincian Aktivitas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="text-slate-700">
                    <td className="py-2.5 text-slate-400">
                      {new Date(log.created_at).toLocaleString("id-ID")}
                    </td>
                    <td className="py-2.5 font-mono font-semibold text-indigo-700 text-[11px]">
                      {log.action}
                    </td>
                    <td className="py-2.5 font-mono text-slate-600 text-[11px] truncate max-w-sm">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

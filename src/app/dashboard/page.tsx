import React from "react";
import Link from "next/link";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Smartphone,
  ArrowUpRight,
  RefreshCw,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";

export default async function DashboardOverviewPage() {
  const user = await getDashboardSessionUser();
  const ownerId = user?.id || "usr_demo_dashboard_owner";

  // Fetch real statistics
  const connection = await db.connections.getByOwnerId(ownerId);
  const { orders } = await db.orders.listByOwner(ownerId, { limit: 100 });
  const recentTransactions = connection ? await db.transactions.listByConnection(connection.id, 5) : [];

  const totalPayments = orders.length;
  const paidOrders = orders.filter(o => o.status === "PAID");
  const pendingOrders = orders.filter(o => o.status === "PENDING");
  const failedOrders = orders.filter(o => o.status === "EXPIRED" || o.status === "FAILED" || o.status === "CANCELLED");
  const totalVolume = paidOrders.reduce((sum, o) => sum + Number(o.amount), 0);

  const isConnected = connection?.status === "CONNECTED";

  return (
    <div className="space-y-8">
      {/* Welcome header & quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pantau status transaksi QRIS dinamis, koneksi GoBiz, dan rekonsiliasi otomatis.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/payments"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition-all"
          >
            <QrCode className="w-4 h-4" />
            <span>Buat QRIS Baru</span>
          </Link>
          <Link
            href="/dashboard/connections/gobiz"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all"
          >
            <Smartphone className="w-4 h-4" />
            <span>Koneksi GoBiz</span>
          </Link>
        </div>
      </div>

      {/* Connection Alert Banner if not connected */}
      {!isConnected && (
        <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-700 flex-shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Akun GoBiz Belum Terhubung</h3>
              <p className="text-xs text-amber-700 mt-0.5">
                Hubungkan nomor HP GoBiz merchant untuk mengaktifkan sinkronisasi transaksi real-time dan pencocokan otomatis.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/connections/gobiz"
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl transition-all whitespace-nowrap self-start sm:self-auto"
          >
            Hubungkan Sekarang
          </Link>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Volume */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Volume Berhasil</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 mt-3">
            Rp {totalVolume.toLocaleString("id-ID")}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <span className="font-semibold text-emerald-600">{paidOrders.length}</span> pembayaran berhasil
          </div>
        </div>

        {/* Total Payments */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Tagihan</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 mt-3">{totalPayments}</div>
          <div className="text-xs text-slate-400 mt-1">Dibuat melalui API & Dashboard</div>
        </div>

        {/* Pending Payments */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Menunggu Bayar</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 mt-3">{pendingOrders.length}</div>
          <div className="text-xs text-slate-400 mt-1">Dalam jendela pembayaran aktif</div>
        </div>

        {/* GoBiz Status */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status GoBiz</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isConnected ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-bold text-slate-900 mt-3 flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
            {connection?.status || "NOT_CONNECTED"}
          </div>
          <div className="text-xs text-slate-400 mt-1 truncate">
            {connection?.merchant_name || "Belum terhubung"}
          </div>
        </div>
      </div>

      {/* Two Column Layout: Recent Payments & Connection Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Payment Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Tagihan QRIS Terbaru</h2>
              <p className="text-xs text-slate-500 mt-0.5">Daftar order pembayaran yang dibuat terakhir</p>
            </div>
            <Link
              href="/dashboard/payments"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
            >
              Lihat Semua
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {orders.length === 0 ? (
            <div className="py-12 text-center">
              <QrCode className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-slate-700">Belum Ada Tagihan Pembayaran</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                Gunakan menu QRIS Payments atau Public REST API untuk membuat tagihan pembayaran pertama Anda.
              </p>
              <Link
                href="/dashboard/payments"
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors"
              >
                Buat Tagihan QRIS
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3">External ID</th>
                    <th className="pb-3">Nominal</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Dibuat Pada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.slice(0, 5).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 font-mono font-medium text-slate-800">{order.external_id}</td>
                      <td className="py-3 font-semibold text-slate-900">
                        Rp {Number(order.amount).toLocaleString("id-ID")}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            order.status === "PAID"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : order.status === "PENDING"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400">
                        {new Date(order.created_at).toLocaleDateString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* GoBiz Connection & Sync Status Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900">Koneksi Merchant</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-indigo-50 text-indigo-700">
                GoBiz v5
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Status Akun</span>
                <span className={`font-semibold ${isConnected ? "text-emerald-600" : "text-slate-600"}`}>
                  {connection?.status || "NOT_CONNECTED"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Merchant Terverifikasi</span>
                <span className="font-medium text-slate-800 truncate max-w-[150px]">
                  {connection?.merchant_name || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Nomor Handphone</span>
                <span className="font-mono text-slate-800">{connection?.phone_masked || "-"}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Merchant ID</span>
                <span className="font-mono text-slate-800">{connection?.merchant_id || "-"}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-500">Sinkronisasi Terakhir</span>
                <span className="text-slate-600">
                  {connection?.last_sync_at
                    ? new Date(connection.last_sync_at).toLocaleTimeString("id-ID")
                    : "-"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              href="/dashboard/connections/gobiz"
              className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Kelola Koneksi GoBiz</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

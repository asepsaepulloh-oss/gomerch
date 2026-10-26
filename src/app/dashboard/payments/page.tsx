"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  QrCode,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Play,
  Download,
} from "lucide-react";

interface PaymentOrder {
  id: string;
  external_id: string;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "FAILED" | "NEEDS_REVIEW";
  description?: string;
  qr_string?: string;
  qr_image_url?: string;
  created_at: string;
  payment_window_end?: string;
  paid_at?: string;
}

export default function PaymentsPage() {
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newExternalId, setNewExternalId] = useState(`ORDER-${Math.floor(10000 + Math.random() * 90000)}`);
  const [newAmount, setNewAmount] = useState("25000");
  const [newDesc, setNewDesc] = useState("Pembayaran pesanan merchant");
  const [creating, setCreating] = useState(false);
  const [modalQrResult, setModalQrResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active Key for API calls
  const [apiKey, setApiKey] = useState<string | null>(null);

  const fetchOrdersAndKey = async () => {
    setLoading(true);
    try {
      // 1. Fetch payments directly via authenticated dashboard session
      const paymentsRes = await fetch("/api/dashboard/payments?limit=100");
      const paymentsData = await paymentsRes.json();
      if (paymentsData.success) {
        setOrders(paymentsData.data.map((p: any) => ({
          id: p.payment_id,
          external_id: p.external_id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          description: p.description,
          created_at: p.created_at,
          paid_at: p.paid_at,
          payment_window_end: p.expires_at,
        })));
      }

      // 2. Fetch or create API key for public API integration
      const keysRes = await fetch("/api/dashboard/api-keys");
      const keysData = await keysRes.json();
      let activeKey = keysData.data?.[0]?.api_key;

      if (!activeKey && keysData.data?.length === 0) {
        const createKeyRes = await fetch("/api/dashboard/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Production Key", environment: "production" }),
        });
        const createKeyData = await createKeyRes.json();
        activeKey = createKeyData.data?.api_key;
      }
      setApiKey(activeKey || null);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersAndKey();
  }, []);

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setErrorMsg(null);

    try {
      // Create payment directly using authenticated dashboard session
      const res = await fetch("/api/dashboard/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          external_id: newExternalId,
          amount: parseInt(newAmount, 10),
          currency: "IDR",
          description: newDesc,
          expires_in_seconds: 900,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Gagal membuat tagihan QRIS.");
      }

      setModalQrResult(data.data);
      // Refresh list
      fetchOrdersAndKey();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleSimulatePayment = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      const res = await fetch("/api/dashboard/simulate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Refresh list
      await fetchOrdersAndKey();
    } catch (err: any) {
      alert(`Simulasi gagal: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelPayment = async (orderId: string) => {
    if (!apiKey) return;
    if (!confirm("Batalkan pembayaran tagihan ini?")) return;
    setActionLoadingId(orderId);
    try {
      const res = await fetch(`/api/v1/payments/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Idempotency-Key": `cancel_${Date.now()}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message);

      await fetchOrdersAndKey();
    } catch (err: any) {
      alert(`Batal gagal: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.external_id.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">QRIS Payments</h1>
          <p className="text-sm text-slate-500 mt-1">
            Kelola tagihan QRIS dinamis, periksa status pembayaran, dan lakukan simulasi.
          </p>
        </div>
        <button
          onClick={() => {
            setNewExternalId(`ORDER-${Math.floor(10000 + Math.random() * 90000)}`);
            setModalQrResult(null);
            setErrorMsg(null);
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Tagihan QRIS</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari External ID atau Payment ID..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {["ALL", "PENDING", "PAID", "CANCELLED", "EXPIRED", "NEEDS_REVIEW"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === st
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">Memuat daftar tagihan...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center">
            <QrCode className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <div className="text-sm font-semibold text-slate-700">Tidak ada tagihan yang cocok</div>
            <p className="text-xs text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau buat tagihan baru.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">External ID</th>
                  <th className="py-3 px-4">Payment ID</th>
                  <th className="py-3 px-4">Nominal</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Dibuat Pada</th>
                  <th className="py-3 px-4">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const isPending = order.status === "PENDING";
                  const isActionLoading = actionLoadingId === order.id;

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        {order.external_id}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {order.id.slice(0, 14)}...
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        Rp {Number(order.amount).toLocaleString("id-ID")}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            order.status === "PAID"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : order.status === "PENDING"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : order.status === "CANCELLED"
                              ? "bg-slate-100 text-slate-600 border border-slate-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(order.created_at).toLocaleString("id-ID", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {isPending && (
                            <>
                              <button
                                onClick={() => handleSimulatePayment(order.id)}
                                disabled={isActionLoading}
                                title="Simulasikan pembayaran dari nasabah via Sandbox"
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                {isActionLoading ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Play className="w-3 h-3 fill-current" />
                                )}
                                <span>Bayar (Demo)</span>
                              </button>

                              <button
                                onClick={() => handleCancelPayment(order.id)}
                                disabled={isActionLoading}
                                className="px-2 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-md text-[11px] font-medium transition-colors"
                              >
                                Batal
                              </button>
                            </>
                          )}
                          {order.status === "PAID" && (
                            <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Lunas
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Payment Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Buat Tagihan QRIS Dinamis</h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
                {errorMsg}
              </div>
            )}

            {modalQrResult ? (
              <div className="py-6 text-center space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block mx-auto">
                  {modalQrResult.qr_image_url ? (
                    <img
                      src={modalQrResult.qr_image_url}
                      alt="QRIS Code"
                      className="w-48 h-48 mx-auto rounded-lg shadow-xs"
                    />
                  ) : (
                    <QrCode className="w-36 h-36 mx-auto text-slate-800" />
                  )}
                </div>

                <div>
                  <div className="text-lg font-bold text-slate-900">
                    Rp {Number(modalQrResult.amount).toLocaleString("id-ID")}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    Order ID: {modalQrResult.external_id}
                  </div>
                </div>

                <div className="p-3 bg-slate-100 rounded-xl text-left">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span>EMVCo QR String:</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(modalQrResult.qr_string)}
                      className="text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Salin
                    </button>
                  </div>
                  <div className="font-mono text-[10px] text-slate-800 break-all bg-white p-2 rounded border border-slate-200">
                    {modalQrResult.qr_string}
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => {
                      handleSimulatePayment(modalQrResult.payment_id);
                      setIsCreateOpen(false);
                    }}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-600/20"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Simulasikan Bayar Lunas</span>
                  </button>
                  <button
                    onClick={() => setIsCreateOpen(false)}
                    className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreatePayment} className="space-y-4 pt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    External ID (Nomor Pesanan)
                  </label>
                  <input
                    type="text"
                    required
                    value={newExternalId}
                    onChange={(e) => setNewExternalId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nominal Tagihan (IDR)
                  </label>
                  <input
                    type="number"
                    required
                    min={1000}
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Deskripsi Pesanan
                  </label>
                  <input
                    type="text"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-medium rounded-xl hover:bg-slate-200"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
                  >
                    {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                    <span>Terbitkan QRIS</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

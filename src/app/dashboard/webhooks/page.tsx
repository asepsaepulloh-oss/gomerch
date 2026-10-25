"use client";

import React, { useState, useEffect } from "react";
import {
  Webhook,
  Plus,
  Send,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  Code2,
} from "lucide-react";

interface WebhookDelivery {
  id: string;
  attempt_count: number;
  http_status: number | null;
  response_excerpt: string | null;
  error_message: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  signing_secret_preview: string;
  enabled: boolean;
  created_at: string;
  deliveries: WebhookDelivery[];
}

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("https://webhook.site/demo-endpoint");
  const [adding, setAdding] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchEndpoints = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/webhooks");
      const data = await res.json();
      if (data.success) {
        setEndpoints(data.data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const handleAddEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/dashboard/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menambahkan webhook endpoint.");
      }

      setNewSecret(data.data.signing_secret);
      fetchEndpoints();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleTestEndpoint = async (endpointId: string) => {
    setTestingId(endpointId);
    try {
      const res = await fetch("/api/dashboard/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint_id: endpointId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert(`Hasil test ping: HTTP ${data.delivery?.http_status || "ERR"} (${data.delivery?.error_message || "Sukses"})`);
      fetchEndpoints();
    } catch (err: any) {
      alert(`Test ping gagal: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteEndpoint = async (endpointId: string) => {
    if (!confirm("Hapus endpoint webhook ini?")) return;
    try {
      await fetch(`/api/dashboard/webhooks?id=${endpointId}`, { method: "DELETE" });
      fetchEndpoints();
    } catch {}
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Signed Webhooks</h1>
          <p className="text-sm text-slate-500 mt-1">
            Terima notifikasi real-time saat status pembayaran QRIS berubah menjadi PAID dengan tanda tangan HMAC-SHA256.
          </p>
        </div>
        <button
          onClick={() => {
            setNewSecret(null);
            setErrorMsg(null);
            setIsAddOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Webhook Endpoint</span>
        </button>
      </div>

      {/* Signature Explanation Banner */}
      <div className="bg-slate-900 text-slate-200 p-6 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex items-start gap-3">
          <Code2 className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-xs">
            <h3 className="font-bold text-white text-sm">Spesifikasi Tanda Tangan Webhook (HMAC-SHA256)</h3>
            <p className="text-slate-400 leading-relaxed">
              Setiap request webhook memuat header <code className="text-indigo-300 font-mono">X-Webhook-Signature</code> dan <code className="text-indigo-300 font-mono">X-Webhook-Timestamp</code>. Tanda tangan dihitung menggunakan string:
            </p>
            <div className="p-2.5 bg-slate-950 rounded-xl font-mono text-[11px] text-emerald-400 border border-slate-800">
              signed_payload = timestamp + &quot;.&quot; + raw_request_body
            </div>
            <p className="text-slate-400 leading-relaxed">
              Verifikasi signature menggunakan constant-time comparison (<code className="text-indigo-300 font-mono">crypto.timingSafeEqual</code>) untuk mencegah timing attack.
            </p>
          </div>
        </div>
      </div>

      {/* Endpoints List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
            Memuat daftar endpoint...
          </div>
        ) : endpoints.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <Webhook className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-700">Belum Ada Webhook Terdaftar</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Tambahkan URL endpoint aplikasi Anda untuk menerima webhook pembayaran otomatis.
            </p>
          </div>
        ) : (
          endpoints.map((ep) => (
            <div key={ep.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-mono text-sm font-bold text-slate-900">{ep.url}</span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-3">
                    <span>Signing Secret: <code className="font-mono text-slate-600">{ep.signing_secret_preview}</code></span>
                    <span>•</span>
                    <span>Dibuat: {new Date(ep.created_at).toLocaleDateString("id-ID")}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTestEndpoint(ep.id)}
                    disabled={testingId === ep.id}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Send className={`w-3.5 h-3.5 ${testingId === ep.id ? "animate-pulse" : ""}`} />
                    <span>Kirim Test Ping</span>
                  </button>
                  <button
                    onClick={() => handleDeleteEndpoint(ep.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Hapus Endpoint"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Delivery logs preview */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-2">Riwayat Pengiriman Terbaru:</h4>
                {ep.deliveries && ep.deliveries.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-400 font-medium">
                          <th className="pb-2">Waktu</th>
                          <th className="pb-2">Status HTTP</th>
                          <th className="pb-2">Percobaan</th>
                          <th className="pb-2">Excerpt / Pesan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ep.deliveries.map((del) => (
                          <tr key={del.id} className="text-slate-700">
                            <td className="py-2 text-slate-400">
                              {new Date(del.created_at).toLocaleTimeString("id-ID")}
                            </td>
                            <td className="py-2">
                              <span
                                className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] ${
                                  del.http_status && del.http_status >= 200 && del.http_status < 300
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-rose-50 text-rose-700"
                                }`}
                              >
                                {del.http_status || "FAILED"}
                              </span>
                            </td>
                            <td className="py-2 font-mono text-[11px]">#{del.attempt_count}</td>
                            <td className="py-2 text-slate-500 truncate max-w-xs font-mono text-[11px]">
                              {del.error_message || del.response_excerpt || "OK"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Belum ada riwayat pengiriman event.</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Webhook Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Tambah Webhook Destination</h3>
              <button
                onClick={() => setIsAddOpen(false)}
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

            {newSecret ? (
              <div className="py-4 space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
                  Webhook endpoint berhasil didaftarkan! Simpan signing secret ini untuk memverifikasi payload pada server Anda.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Signing Secret (HMAC-SHA256)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={newSecret}
                      className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-900 select-all"
                    />
                    <button
                      onClick={() => copyToClipboard(newSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-600"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setIsAddOpen(false)}
                    className="w-full py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800"
                  >
                    Selesai
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddEndpoint} className="space-y-4 pt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Endpoint Destination URL
                  </label>
                  <input
                    type="url"
                    required
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://api.domainanda.com/webhooks/qris"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Hanya URL HTTPS/HTTP publik yang diizinkan (dilindungi dari serangan SSRF).
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-medium rounded-xl hover:bg-slate-200"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={adding}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
                  >
                    {adding ? "Menyimpan..." : "Daftarkan Endpoint"}
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

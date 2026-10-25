"use client";

import React, { useState, useEffect } from "react";
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  AlertTriangle,
  Trash2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  environment: "sandbox" | "production";
  permissions: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("Aplikasi Web / Toko Online");
  const [keyEnv, setKeyEnv] = useState<"sandbox" | "production">("sandbox");
  const [creating, setCreating] = useState(false);
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/api-keys");
      const data = await res.json();
      if (data.success) {
        setKeys(data.data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const res = await fetch("/api/dashboard/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName, environment: keyEnv }),
      });

      const data = await res.json();
      if (data.success) {
        setNewKeySecret(data.data.api_key);
        fetchKeys();
      }
    } catch {
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin mencabut API key ini? Aplikasi eksternal yang menggunakannya akan langsung ditolak.")) return;

    try {
      await fetch(`/api/dashboard/api-keys?id=${id}`, { method: "DELETE" });
      fetchKeys();
    } catch {}
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">API Keys</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gunakan API key untuk mengautentikasi panggilan REST API dari server aplikasi Anda ke QRIS Gateway.
          </p>
        </div>
        <button
          onClick={() => {
            setNewKeySecret(null);
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Buat API Key Baru</span>
        </button>
      </div>

      {/* Security notice */}
      <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-start gap-3 text-xs text-indigo-900">
        <ShieldCheck className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold">Standar Keamanan API Key:</span> Secret API key hanya ditampilkan satu kali pada saat pembuatan dan disimpan dalam bentuk hash SHA-256 kriptografis. Jangan pernah menanamkan secret key ke dalam aplikasi frontend publik (browser).
        </div>
      </div>

      {/* Keys Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">Memuat daftar API key...</div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center">
            <KeyRound className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-700">Belum Ada API Key</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Buat API key pertama Anda untuk mulai mengintegrasikan pembuatan pembayaran QRIS dari sistem backend Anda.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Nama Key</th>
                  <th className="py-3 px-4">Prefix Token</th>
                  <th className="py-3 px-4">Environment</th>
                  <th className="py-3 px-4">Dibuat Pada</th>
                  <th className="py-3 px-4">Terakhir Dipakai</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">{k.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{k.key_prefix}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                          k.environment === "production"
                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        {k.environment}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(k.created_at).toLocaleDateString("id-ID")}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString("id-ID") : "Belum pernah"}
                    </td>
                    <td className="py-3 px-4">
                      {k.revoked_at ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          REVOKED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {!k.revoked_at && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-medium rounded-lg transition-colors cursor-pointer"
                        >
                          Cabut Key
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Create Key */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Buat API Key Baru</h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {newKeySecret ? (
              <div className="py-4 space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p>
                    <strong>Penting:</strong> Simpan kunci ini sekarang di tempat aman (misal: .env file server Anda). Anda tidak akan dapat melihat kunci ini lagi!
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    API Secret Key
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={newKeySecret}
                      className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-900 select-all"
                    />
                    <button
                      onClick={() => copyToClipboard(newKeySecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-600"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setIsCreateOpen(false)}
                    className="w-full py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800"
                  >
                    Saya Sudah Menyimpan Kunci Ini
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateKey} className="space-y-4 pt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nama Deskriptif Key
                  </label>
                  <input
                    type="text"
                    required
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="Contoh: Backend Server Production"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Environment
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setKeyEnv("sandbox")}
                      className={`p-3 rounded-xl border text-xs font-medium text-left transition-all ${
                        keyEnv === "sandbox"
                          ? "border-indigo-600 bg-indigo-50/50 text-indigo-900"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      <div className="font-bold">Sandbox</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Untuk pengujian lokal</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setKeyEnv("production")}
                      className={`p-3 rounded-xl border text-xs font-medium text-left transition-all ${
                        keyEnv === "production"
                          ? "border-indigo-600 bg-indigo-50/50 text-indigo-900"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      <div className="font-bold">Production</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Transaksi resmi</div>
                    </button>
                  </div>
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
                    {creating ? "Membuat..." : "Buat API Key"}
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

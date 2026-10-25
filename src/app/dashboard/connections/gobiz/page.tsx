"use client";

import React, { useState, useEffect } from "react";
import {
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Unlink,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";

export default function GobizConnectionPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [connection, setConnection] = useState<any>(null);

  // Form states
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState("081234567890");
  const [otp, setOtp] = useState("123456");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchConnection = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/gobiz/otp-verify"); // Or general status check
      // For dashboard display we can check connection
      const overviewRes = await fetch("/api/v1/payments"); // check auth
      // Let's set connection based on latest DB or initial load
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnection();
  }, []);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/gobiz/otp-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal meminta OTP.");
      }

      setMaskedPhone(data.phone_masked);
      setSuccessMsg(data.message || "Kode OTP telah dikirim.");
      setStep("otp");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/gobiz/otp-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: phoneNumber,
          otp,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Verifikasi OTP gagal.");
      }

      setConnection(data.data);
      setSuccessMsg("Akun GoBiz berhasil terhubung!");
      setStep("phone");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Apakah Anda yakin ingin memutuskan koneksi GoBiz merchant ini?")) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/gobiz/disconnect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setConnection(null);
      setSuccessMsg("Koneksi GoBiz berhasil diputuskan.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSync = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/gobiz/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMsg(`Sinkronisasi berhasil: ${data.data?.transactionsFetched || 0} transaksi diproses.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Koneksi Merchant GoBiz</h1>
        <p className="text-sm text-slate-500 mt-1">
          Hubungkan akun merchant GoBiz melalui verifikasi OTP resmi untuk sinkronisasi mutasi dan riwayat pembayaran QRIS.
        </p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="leading-relaxed">{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="leading-relaxed">{successMsg}</div>
        </div>
      )}

      {/* Connection Card */}
      {connection ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{connection.merchant_name}</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                    CONNECTED
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">Merchant ID: {connection.merchant_id}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={submitting}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${submitting ? "animate-spin" : ""}`} />
                <span>Sinkronisasi Manual</span>
              </button>
              <button
                onClick={handleDisconnect}
                disabled={submitting}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Putuskan Koneksi</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-slate-400 font-medium">Nomor HP Terhubung</div>
              <div className="font-mono text-slate-900 font-semibold text-sm mt-1">
                {connection.phone_masked}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Nomor tersimpan secara aman & disamarkan</div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-slate-400 font-medium">Keamanan Token</div>
              <div className="text-emerald-700 font-semibold text-sm mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                AES-256-GCM Terenkripsi
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Token GoBiz tidak pernah dikirim ke browser</div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-slate-400 font-medium">Status Masa Berlaku</div>
              <div className="font-mono text-slate-900 font-semibold text-sm mt-1">
                Aktif (Auto-Refresh)
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Diperbarui otomatis oleh worker</div>
            </div>
          </div>
        </div>
      ) : (
        /* Unconnected / Connect Form */
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <Smartphone className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Hubungkan Akun GoBiz</h2>
              <p className="text-xs text-slate-500 mt-1">
                Masukkan nomor ponsel yang terdaftar pada aplikasi GoBiz Merchant.
              </p>
            </div>

            {/* Step 1: Input Phone */}
            {step === "phone" ? (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Nomor Handphone Merchant
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 pointer-events-none">
                      +62
                    </span>
                    <input
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="812-3456-7890"
                      className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Mendukung format: 0812..., 62812..., atau +62812...
                  </p>
                </div>

                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900">
                  <div className="font-semibold mb-0.5">Sandbox Mode Tips:</div>
                  Gunakan nomor demo <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200">081234567890</code> dan OTP <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200">123456</code> untuk simulasi instan.
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {submitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Kirim Kode OTP</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Step 2: Input OTP */
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="text-center p-3 bg-slate-50 rounded-xl border border-slate-100 mb-2">
                  <span className="text-xs text-slate-500">Kode verifikasi telah dikirim ke:</span>
                  <div className="font-mono font-bold text-slate-800 text-sm mt-0.5">{maskedPhone}</div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Masukkan 6 Digit OTP
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    className="w-full text-center tracking-widest text-xl font-mono py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("phone")}
                    className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all"
                  >
                    Ubah Nomor
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {submitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>Verifikasi & Hubungkan</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Security Info Card */}
      <div className="p-6 bg-slate-100 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-2">
        <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-indigo-600" />
          Ketentuan Keamanan & Arsitektur Dua Tahap:
        </h4>
        <ul className="list-disc pl-5 space-y-1 leading-relaxed text-slate-600">
          <li>Sesi dashboard dan koneksi GoBiz memiliki siklus hidup (lifecycle) yang terpisah secara independen.</li>
          <li>Token GoBiz dienkripsi di server menggunakan AES-256-GCM dengan initialization vector (IV) unik dan tidak pernah dikirim ke frontend.</li>
          <li>Identitas merchant diverifikasi melalui endpoint resmi GoBiz, bukan mempercayai input manual.</li>
        </ul>
      </div>
    </div>
  );
}

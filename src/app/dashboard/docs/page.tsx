"use client";

import React, { useState } from "react";
import { BookOpen, Copy, Check, Terminal, Code2, ShieldAlert } from "lucide-react";

export default function ApiDocsPage() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyCode = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const createCurl = `curl -X POST https://your-domain.com/api/v1/qris/create \\
  -H "Authorization: Bearer qris_test_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: ORDER-10001-attempt-1" \\
  -d '{
    "external_id": "ORDER-10001",
    "amount": 25000,
    "currency": "IDR",
    "description": "Pembayaran pesanan nasi goreng"
  }'`;

  const checkCurl = `curl -X GET https://your-domain.com/api/v1/payments/pay_example123 \\
  -H "Authorization: Bearer qris_test_your_api_key_here"`;

  const cancelCurl = `curl -X POST https://your-domain.com/api/v1/payments/pay_example123/cancel \\
  -H "Authorization: Bearer qris_test_your_api_key_here" \\
  -H "Idempotency-Key: cancel-pay_example123"`;

  const nodeVerificationSnippet = `// Node.js Webhook Signature Verification
import crypto from "crypto";

export function verifyWebhook(rawBody, signatureHeader, timestampHeader, secret) {
  const signedPayload = \`\${timestampHeader}.\${rawBody}\`;
  const expectedSignature = "v1=" + crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expectedSignature, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");

  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}`;

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dokumentasi REST API v1</h1>
        <p className="text-sm text-slate-500 mt-1">
          Panduan integrasi teknis pembuatan tagihan QRIS dinamis, pengecekan status, idempotensi, dan webhook.
        </p>
      </div>

      {/* Authentication & Idempotency Overview */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-indigo-600" />
          Autentikasi & Header Permintaan
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Seluruh endpoint publik berada di prefix <code className="font-mono text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">/api/v1/</code> dan memerlukan autentikasi melalui header HTTP Authorization dengan format Bearer token API key.
        </p>
        <div className="p-3 bg-slate-900 rounded-xl text-slate-200 font-mono text-xs overflow-x-auto">
          Authorization: Bearer qris_test_xxxxxxxxxxxxxxxxxxxxxxxx
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Endpoint yang memodifikasi state transaksi wajib menyertakan header <code className="font-mono text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">Idempotency-Key</code> untuk mencegah terjadinya tagihan ganda apabila terjadi kegagalan jaringan atau retry dari pemanggil.
        </p>
      </div>

      {/* Endpoint 1: Create QRIS Payment */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-emerald-100 text-emerald-800">
            POST
          </span>
          <span className="font-mono text-sm font-bold text-slate-800">/api/v1/qris/create</span>
        </div>
        <p className="text-xs text-slate-600">
          Membuat tagihan pembayaran QRIS dinamis baru. Mengembalikan string QRIS EMVCo dan gambar QR siap render.
        </p>

        <div className="relative">
          <button
            onClick={() => copyCode(createCurl, 1)}
            className="absolute right-3 top-3 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center gap-1"
          >
            {copiedIndex === 1 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>Salin cURL</span>
          </button>
          <pre className="p-4 bg-slate-950 text-slate-200 rounded-xl font-mono text-xs overflow-x-auto">
            {createCurl}
          </pre>
        </div>

        <div className="text-xs space-y-2">
          <div className="font-semibold text-slate-700">Contoh Respons Sukses (HTTP 201 Created):</div>
          <pre className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] text-slate-800 overflow-x-auto">
{`{
  "success": true,
  "data": {
    "payment_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "external_id": "ORDER-10001",
    "amount": 25000,
    "currency": "IDR",
    "payment_method": "QRIS",
    "status": "PENDING",
    "qr_string": "00020101021226500014ID.CO.QRIS.WWW0115ID10200000000000208936009990303UME5204541153033605405250005802ID5914MERCHANT DEMO6007JAKARTA62150111ORDER-100016304A1B2",
    "qr_image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "expires_at": "2026-10-25T03:29:35.000Z"
  }
}`}
          </pre>
        </div>
      </div>

      {/* Endpoint 2: Check Payment */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-indigo-100 text-indigo-800">
            GET
          </span>
          <span className="font-mono text-sm font-bold text-slate-800">/api/v1/payments/:id</span>
        </div>
        <p className="text-xs text-slate-600">
          Memeriksa status pembayaran tagihan berdasarkan Payment ID.
        </p>

        <div className="relative">
          <button
            onClick={() => copyCode(checkCurl, 2)}
            className="absolute right-3 top-3 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center gap-1"
          >
            {copiedIndex === 2 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>Salin cURL</span>
          </button>
          <pre className="p-4 bg-slate-950 text-slate-200 rounded-xl font-mono text-xs overflow-x-auto">
            {checkCurl}
          </pre>
        </div>
      </div>

      {/* Webhook Signature Verification Guide */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Code2 className="w-5 h-5 text-indigo-600" />
          Verifikasi Tanda Tangan Webhook
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Setiap kali pembayaran dikonfirmasi lunas, QRIS Gateway akan mengirimkan event <code className="font-mono text-indigo-600">payment.paid</code> ke endpoint Anda. Verifikasi tanda tangan berikut untuk memastikan integritas pesan:
        </p>

        <div className="relative">
          <button
            onClick={() => copyCode(nodeVerificationSnippet, 3)}
            className="absolute right-3 top-3 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center gap-1"
          >
            {copiedIndex === 3 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>Salin Kode</span>
          </button>
          <pre className="p-4 bg-slate-950 text-slate-200 rounded-xl font-mono text-xs overflow-x-auto">
            {nodeVerificationSnippet}
          </pre>
        </div>
      </div>

      {/* Error Codes Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900">Daftar Kode Error Standard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="py-2.5 px-3">Kode Error</th>
                <th className="py-2.5 px-3">HTTP Status</th>
                <th className="py-2.5 px-3">Deskripsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              <tr>
                <td className="py-2 px-3 text-slate-900 font-bold">UNAUTHORIZED</td>
                <td className="py-2 px-3">401</td>
                <td className="py-2 px-3 font-sans text-slate-600">API Key tidak valid, salah, atau telah dicabut.</td>
              </tr>
              <tr>
                <td className="py-2 px-3 text-slate-900 font-bold">MISSING_IDEMPOTENCY_KEY</td>
                <td className="py-2 px-3">400</td>
                <td className="py-2 px-3 font-sans text-slate-600">Header Idempotency-Key belum disertakan.</td>
              </tr>
              <tr>
                <td className="py-2 px-3 text-slate-900 font-bold">IDEMPOTENCY_MISMATCH</td>
                <td className="py-2 px-3">409</td>
                <td className="py-2 px-3 font-sans text-slate-600">Kunci idempotensi sama digunakan dengan payload berbeda.</td>
              </tr>
              <tr>
                <td className="py-2 px-3 text-slate-900 font-bold">DUPLICATE_EXTERNAL_ID</td>
                <td className="py-2 px-3">409</td>
                <td className="py-2 px-3 font-sans text-slate-600">Order dengan external_id tersebut sudah pernah dibuat.</td>
              </tr>
              <tr>
                <td className="py-2 px-3 text-slate-900 font-bold">CANNOT_CANCEL_PAID</td>
                <td className="py-2 px-3">409</td>
                <td className="py-2 px-3 font-sans text-slate-600">Tagihan yang sudah berstatus PAID tidak dapat dibatalkan.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Search,
  Filter,
} from "lucide-react";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";

export default async function TransactionsPage() {
  const user = await getDashboardSessionUser();
  const ownerId = user?.id || "usr_demo_dashboard_owner";

  const connection = await db.connections.getByOwnerId(ownerId);
  const transactions = connection ? await db.transactions.listByConnection(connection.id, 100) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Riwayat Transaksi Provider</h1>
        <p className="text-sm text-slate-500 mt-1">
          Daftar mutasi transaksi pembayaran yang dilaporkan oleh GoBiz Merchant Analytics atau Mock Sandbox.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {transactions.length === 0 ? (
          <div className="p-12 text-center">
            <ArrowLeftRight className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-700">Belum Ada Transaksi Tercatat</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Setelah akun GoBiz terhubung atau simulasi pembayaran dijalankan, riwayat transaksi akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Provider Tx ID</th>
                  <th className="py-3 px-4">Merchant</th>
                  <th className="py-3 px-4">Nominal</th>
                  <th className="py-3 px-4">Waktu Transaksi</th>
                  <th className="py-3 px-4">Sumber</th>
                  <th className="py-3 px-4">Status Pencocokan</th>
                  <th className="py-3 px-4">Order Terkait</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">
                      {tx.provider_transaction_id}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-mono text-[11px]">
                      {tx.merchant_id}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      Rp {Number(tx.payable_amount).toLocaleString("id-ID")}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(tx.transaction_time).toLocaleString("id-ID", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        {tx.source}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          tx.match_status === "MATCHED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : tx.match_status === "CONFLICT"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {tx.match_status === "MATCHED" && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                        {tx.match_status === "CONFLICT" && <AlertCircle className="w-3 h-3 text-rose-600" />}
                        {tx.match_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                      {tx.matched_order_id ? `${tx.matched_order_id.slice(0, 10)}...` : "-"}
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

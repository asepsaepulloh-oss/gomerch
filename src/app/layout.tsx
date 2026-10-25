import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QRIS Payment Gateway - Merchant Platform",
  description: "Enterprise Dynamic QRIS Payment Gateway with GoBiz Integration & Automated Reconciliation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}

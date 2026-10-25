import React from "react";
import { DashboardSidebar } from "@/components/layout/sidebar";
import { DashboardTopbar } from "@/components/layout/topbar";
import { getDashboardSessionUser } from "@/server/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getDashboardSessionUser();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopbar
          userEmail={user?.email || "merchant@demo.local"}
          displayName={user?.displayName || "Merchant Admin"}
        />
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

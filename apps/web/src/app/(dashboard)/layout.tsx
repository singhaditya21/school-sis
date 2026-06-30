import Link from 'next/link';
import { 
  LayoutDashboard, 
  Users, 
  Database, 
  Store, 
  Settings,
  GraduationCap
} from 'lucide-react';

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/next-auth";
import { pool } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  let schoolName = "Springfield High School";

  if (session && session.user) {
    // @ts-ignore
    const tenantId = session.user.tenantId;
    try {
      const res = await pool.query(
        "SELECT name FROM tenants WHERE id = $1 LIMIT 1",
        [tenantId]
      );
      if (res.rowCount > 0) {
        schoolName = res.rows[0].name;
      }
    } catch (e) {
      console.error("Failed to resolve tenant name dynamically:", e);
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <GraduationCap className="w-8 h-8 text-blue-500 mr-3" />
          <span className="text-xl font-bold">School OS</span>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-2 px-4">
          <Link href="/executive" className="flex items-center px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors">
            <LayoutDashboard className="w-5 h-5 mr-3 text-slate-400" />
            <span>Executive Dashboard</span>
          </Link>
          
          <Link href="/students" className="flex items-center px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors">
            <Users className="w-5 h-5 mr-3 text-slate-400" />
            <span>Student Directory</span>
          </Link>

          <Link href="/data" className="flex items-center px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors">
            <Database className="w-5 h-5 mr-3 text-slate-400" />
            <span>Metadata Engine</span>
          </Link>

          <Link href="/appexchange" className="flex items-center px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors mt-8">
            <Store className="w-5 h-5 mr-3 text-purple-400" />
            <span className="text-purple-50">AppExchange</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button className="flex items-center w-full px-4 py-2 text-slate-400 hover:text-white transition-colors">
            <Settings className="w-5 h-5 mr-3" />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8">
          <h1 className="text-xl font-semibold text-gray-800">{schoolName}</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">Admin Portal</span>
            <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200"></div>
          </div>
        </header>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

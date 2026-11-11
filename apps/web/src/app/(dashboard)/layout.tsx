import Link from 'next/link';
import { 
  LayoutDashboard, 
  Users, 
  Database, 
  Store, 
  LogOut,
  GraduationCap
} from 'lucide-react';

import { runWithTenantContext, sql } from "@/lib/db";
import { getSession } from '@/lib/auth/session';
import { isTenantStaffRole } from '@/lib/auth/page-access';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  let schoolName = "School Workspace";

  if (!session.isLoggedIn) {
    redirect('/login');
  }

  if (!isTenantStaffRole(session.role)) {
    redirect('/unauthorized');
  }

  if (session.tenantId) {
    try {
      const rows = await runWithTenantContext(session.tenantId, async () =>
        sql<{ name: string }>`SELECT name FROM tenants WHERE id = ${session.tenantId} LIMIT 1`
      );
      if (rows[0]?.name) {
        schoolName = rows[0].name;
      }
    } catch (e) {
      console.error("Failed to resolve tenant name dynamically:", e);
    }
  }

  return (
    <div className="flex h-screen bg-muted">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <GraduationCap className="w-8 h-8 text-blue-500 mr-3" />
          <span className="text-xl font-bold">School OS</span>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-2 px-4">
          <Link href="/executive" className="flex items-center px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors">
            <LayoutDashboard className="w-5 h-5 mr-3 text-muted-foreground" />
            <span>Executive Dashboard</span>
          </Link>
          
          <Link href="/students" className="flex items-center px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors">
            <Users className="w-5 h-5 mr-3 text-muted-foreground" />
            <span>Student Directory</span>
          </Link>

          <Link href="/data" className="flex items-center px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors">
            <Database className="w-5 h-5 mr-3 text-muted-foreground" />
            <span>Metadata Engine</span>
          </Link>

          <Link href="/appexchange" className="flex items-center px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors mt-8">
            <Store className="w-5 h-5 mr-3 text-purple-400" />
            <span className="text-purple-50">AppExchange</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <form action="/api/logout" method="POST">
            <button
              type="submit"
              className="flex items-center w-full px-4 py-2 text-muted-foreground hover:text-white transition-colors rounded-lg hover:bg-slate-800"
            >
              <LogOut className="w-5 h-5 mr-3" />
              <span>Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-8">
          <h1 className="text-xl font-semibold text-foreground">{schoolName}</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Admin Portal</span>
            <form action="/api/logout" method="POST">
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-border transition-colors"
              >
                Sign Out
              </button>
            </form>
          </div>
        </header>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

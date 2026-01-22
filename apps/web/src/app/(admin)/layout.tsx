import { getSession } from '@/lib/auth/session';
import { isStaff } from '@/lib/rbac/permissions';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    // Check if user has staff/admin access
    if (!isStaff(session.role as any)) {
        redirect('/unauthorized');
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                                <span className="text-white text-xl">🎓</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">
                                    School SIS
                                </h1>
                                <p className="text-sm text-gray-500">
                                    Administration Portal
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-600">
                                {session.email}
                            </span>
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                {session.role}
                            </span>
                            <form action="/api/logout" method="POST">
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Logout
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Sidebar Navigation */}
                <aside className="w-64 bg-white border-r border-gray-200 min-h-screen sticky top-16">
                    <nav className="p-4 space-y-1">
                        <NavLink href="/dashboard" icon="📊">
                            Dashboard
                        </NavLink>
                        <NavLink href="/fees" icon="💰">
                            Fee Collections
                        </NavLink>
                        <NavLink href="/fees/intelligence" icon="🤖">
                            AI Intelligence
                        </NavLink>
                        <NavLink href="/fees/defaulters" icon="⚠️">
                            Defaulters
                        </NavLink>
                        <NavLink href="/invoices" icon="🧾">
                            Invoices
                        </NavLink>
                        <NavLink href="/students" icon="👥">
                            Students
                        </NavLink>
                        <NavLink href="/health" icon="🏥">
                            Health Records
                        </NavLink>
                        <NavLink href="/attendance" icon="✅">
                            Attendance
                        </NavLink>
                        <NavLink href="/exams" icon="📝">
                            Exams
                        </NavLink>
                        <NavLink href="/admissions" icon="🎓">
                            Admissions
                        </NavLink>
                        <NavLink href="/timetable" icon="📅">
                            Timetable
                        </NavLink>
                        <NavLink href="/transport" icon="🚌">
                            Transport
                        </NavLink>
                        <NavLink href="/library" icon="📚">
                            Library
                        </NavLink>
                        <NavLink href="/inventory" icon="📦">
                            Inventory
                        </NavLink>
                        <NavLink href="/messages/templates" icon="✉️">
                            Messages
                        </NavLink>
                        <NavLink href="/messages/tracking" icon="📡">
                            Delivery Tracking
                        </NavLink>
                        <NavLink href="/timetable/substitution" icon="🔄">
                            Substitutions
                        </NavLink>
                        <NavLink href="/certificates" icon="📜">
                            Certificates
                        </NavLink>
                        <NavLink href="/digilocker" icon="🔐">
                            DigiLocker
                        </NavLink>
                        <NavLink href="/fees/cashflow" icon="📈">
                            Cashflow
                        </NavLink>
                        <NavLink href="/fees/alerts" icon="🔔">
                            Fee Alerts
                        </NavLink>
                        <NavLink href="/exams/verification" icon="✓">
                            Marks Verification
                        </NavLink>
                        <NavLink href="/compliance" icon="🏛️">
                            Compliance
                        </NavLink>
                        <NavLink href="/analytics" icon="📊">
                            Analytics
                        </NavLink>
                        <NavLink href="/audit" icon="📋">
                            Audit Log
                        </NavLink>
                        <NavLink href="/schools" icon="🏫">
                            Schools
                        </NavLink>
                        <NavLink href="/api-docs" icon="📖">
                            API Docs
                        </NavLink>
                        <NavLink href="/hr" icon="👥">
                            HR & Payroll
                        </NavLink>
                        <NavLink href="/appointments" icon="📅">
                            Appointments
                        </NavLink>
                        <NavLink href="/diary" icon="📓">
                            Digital Diary
                        </NavLink>
                        <NavLink href="/homework" icon="📝">
                            Homework
                        </NavLink>
                        <NavLink href="/lesson-plans" icon="📚">
                            Lesson Plans
                        </NavLink>
                        <NavLink href="/calendar" icon="🗓️">
                            Academic Calendar
                        </NavLink>
                        <NavLink href="/quiz" icon="📝">
                            Online Quiz
                        </NavLink>
                        <NavLink href="/id-cards" icon="🪪">
                            ID Cards
                        </NavLink>
                        <NavLink href="/visitors" icon="🚶">
                            Visitors
                        </NavLink>
                        <NavLink href="/documents" icon="📂">
                            Documents
                        </NavLink>
                        <NavLink href="/alumni" icon="🎓">
                            Alumni
                        </NavLink>
                        <NavLink href="/hostel" icon="🏠">
                            Hostel
                        </NavLink>
                        <NavLink href="/settings/grading" icon="⚙️">
                            Grading Settings
                        </NavLink>
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-6 lg:p-8">{children}</main>
            </div>
        </div>
    );
}

function NavLink({
    href,
    icon,
    children,
}: {
    href: string;
    icon: string;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
        >
            <span>{icon}</span>
            <span className="text-sm font-medium">{children}</span>
        </Link>
    );
}

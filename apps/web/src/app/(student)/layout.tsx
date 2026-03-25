import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function StudentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    if (session.role !== 'STUDENT') {
        // Fallback for demo purposes if we login as someone else
        // redirect('/unauthorized');
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Mobile-first Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="px-4 py-3 md:px-6 md:py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
                                <span className="text-white text-lg md:text-xl">🎓</span>
                            </div>
                            <div>
                                <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">
                                    ScholarMind
                                </h1>
                                <p className="text-xs text-gray-500 font-medium">
                                    Student Workspace
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="hidden md:flex flex-col items-end mr-2">
                                <span className="text-sm font-semibold text-gray-700">Aarav Sharma</span>
                                <span className="text-xs text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded">B.Tech CS • Yr 2</span>
                            </div>
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold border border-violet-200 shadow-sm cursor-pointer hover:bg-violet-200 transition-colors">
                                AS
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-col md:flex-row min-h-[calc(100vh-65px)]">
                {/* Mobile Bottom Nav / Desktop Sidebar Navigation */}
                <aside className="fixed bottom-0 left-0 right-0 md:relative md:w-64 bg-white border-t md:border-t-0 md:border-r border-gray-200 z-40">
                    <nav className="flex md:flex-col justify-around md:justify-start p-2 md:p-4 space-x-1 md:space-x-0 md:space-y-1 overflow-x-auto md:overflow-visible">
                        <NavLink href="/student" icon="📊" active={true}>
                            Overview
                        </NavLink>
                        <NavLink href="/student/homework" icon="📝">
                            Assignments
                        </NavLink>
                        <NavLink href="/student/courses" icon="📚">
                            My Courses
                        </NavLink>
                        <NavLink href="/student/ai-tutor" icon="🤖">
                            AI Tutor
                        </NavLink>
                        <NavLink href="/student/wallet" icon="💳">
                            Skills Wallet
                        </NavLink>
                        <NavLink href="/student/placements" icon="💼">
                            Placements
                        </NavLink>
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-8">{children}</main>
            </div>
        </div>
    );
}

function NavLink({
    href,
    icon,
    children,
    active = false
}: {
    href: string;
    icon: string;
    children: React.ReactNode;
    active?: boolean;
}) {
    return (
        <Link
            href={href}
            className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:py-3 rounded-lg transition-colors min-w-[72px] md:min-w-0 ${
                active 
                ? 'text-violet-700 bg-violet-50 md:bg-gray-50 md:text-gray-900 border-t-2 md:border-t-0 md:border-l-4 border-violet-600' 
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
        >
            <span className={`text-xl md:text-lg ${active ? 'md:text-violet-600' : ''}`}>{icon}</span>
            <span className={`text-[10px] md:text-sm font-medium ${active ? 'font-semibold' : ''}`}>{children}</span>
        </Link>
    );
}

import GlobalNavbar from '@/components/public/GlobalNavbar';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-slate-50 min-h-screen font-sans selection:bg-indigo-200">
            <GlobalNavbar />
            <main>{children}</main>
        </div>
    );
}

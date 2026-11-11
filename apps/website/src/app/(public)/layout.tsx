import GlobalNavbar from '@/components/public/GlobalNavbar';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-ivory text-slate-900 min-h-screen font-sans selection:bg-parchment">
            <GlobalNavbar />
            <main>{children}</main>
        </div>
    );
}

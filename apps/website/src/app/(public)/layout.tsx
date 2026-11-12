import GlobalNavbar from '@/components/public/GlobalNavbar';
import GlobalFooter from '@/components/public/GlobalFooter';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-ivory text-slate-900 min-h-screen font-sans selection:bg-parchment flex flex-col">
            <GlobalNavbar />
            <main className="flex-1">{children}</main>
            <GlobalFooter />
        </div>
    );
}

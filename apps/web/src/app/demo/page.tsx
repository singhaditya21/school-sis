import { Badge } from '@/components/ui/badge';
import { DemoLauncherClient } from './demo-launcher-client';

export const metadata = {
    title: 'Interactive Demo Campus | ScholarMind',
};

export default function InteractiveDemoPage() {
    return (
        <main className="min-h-screen bg-muted/40 py-12 px-6">
            <div className="mx-auto max-w-5xl space-y-8">
                <div className="space-y-3 text-center max-w-3xl mx-auto">
                    <div className="flex justify-center gap-2">
                        <Badge variant="outline">Zero Sign-Up Required</Badge>
                        <Badge variant="secondary">Delhi Heritage Public School · CBSE Sandbox</Badge>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                        Explore ScholarMind Live in 1 Click
                    </h1>
                    <p className="text-base text-muted-foreground">
                        Step directly into a pre-populated CBSE campus sandbox with realistic students, overdue fee ageing, receipts, WhatsApp UPI pay links, and our 48-hour ERP importer.
                    </p>
                </div>

                <DemoLauncherClient />
            </div>
        </main>
    );
}

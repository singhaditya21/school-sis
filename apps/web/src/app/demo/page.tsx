import { Badge } from '@/components/ui/badge';
import { ScholarMindCrest } from '@/components/brand/ScholarMindCrest';
import { DemoLauncherClient } from './demo-launcher-client';

export const metadata = {
    title: 'Interactive Demo Campus | ScholarMind',
};

export default function InteractiveDemoPage() {
    return (
        <main className="min-h-screen bg-background">
            <div className="h-1 w-full bg-gradient-to-r from-primary via-brass to-primary" />
            <div className="py-12 px-6">
                <div className="mx-auto max-w-5xl space-y-8">
                    <div className="space-y-4 text-center max-w-3xl mx-auto">
                        <div className="flex justify-center">
                            <ScholarMindCrest size="lg" />
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                            <Badge variant="outline" className="border-brass/40 text-foreground">
                                Zero Sign-Up Required
                            </Badge>
                            <Badge variant="secondary" className="bg-accent text-accent-foreground border border-brass/30">
                                Delhi Heritage Public School · CBSE Sandbox
                            </Badge>
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
            </div>
        </main>
    );
}

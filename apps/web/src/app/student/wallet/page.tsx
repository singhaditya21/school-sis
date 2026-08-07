import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SkillsWalletPage() {
    return (
        <div className="mx-auto max-w-3xl space-y-6 pb-6">
            <div className="border-b border-gray-200 pb-4">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    Digital Credentials Wallet
                </h1>
                <p className="mt-1 text-sm text-gray-500 md:text-base">
                    Verified credentials will appear here only after a live issuer or DigiLocker
                    integration confirms them.
                </p>
            </div>

            <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                    <CardTitle>No verified credentials available</CardTitle>
                    <CardDescription>
                        DigiLocker sync, APAAR sharing, external credential imports, and skill-point
                        calculations are disabled until their live verification services are configured.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                        This page never labels locally entered or fixture data as cryptographically verified.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

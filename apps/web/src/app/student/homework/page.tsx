import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function StudentHomeworkUnavailablePage() {
    return (
        <div className="mx-auto max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>Assignments are unavailable</CardTitle>
                    <CardDescription>
                        This release does not expose sample assignments as student records.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        The assignment workspace will open after teacher publishing, student ownership, submission persistence, and due-date rules pass pilot validation.
                    </p>
                    <Button asChild variant="outline">
                        <Link href="/student">Return to student home</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

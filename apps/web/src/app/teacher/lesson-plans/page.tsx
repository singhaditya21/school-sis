import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LessonPlansUnavailablePage() {
    return (
        <div className="mx-auto max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>Lesson-plan automation is unavailable</CardTitle>
                    <CardDescription>
                        ScholarMind does not expose generated curriculum content as a live teaching plan in this release.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        This workspace will remain closed until source curriculum, human approval, provenance, export persistence, and model-safety evidence are implemented.
                    </p>
                    <Button asChild variant="outline">
                        <Link href="/teacher/my-classes">Return to my classes</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

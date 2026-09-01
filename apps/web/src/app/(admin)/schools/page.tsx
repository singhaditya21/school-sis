import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getSchoolsPageData } from './queries';

export const metadata = {
    title: 'School Profile | ScholarMind',
};

function formatDate(value: Date | string): string {
    return new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-medium text-foreground dark:text-gray-100">
                {value && value.trim() !== '' ? value : <span className="text-muted-foreground">Not recorded</span>}
            </dd>
        </div>
    );
}

export default async function SchoolsPage() {
    const { campus, counts } = await getSchoolsPageData();

    if (!campus) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold">School Profile</h1>
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground dark:text-muted-foreground">
                        Your session is not attached to a school record.
                    </CardContent>
                </Card>
            </div>
        );
    }

    const location = [campus.city, campus.state, campus.pincode].filter(Boolean).join(', ');

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">School Profile</h1>
                    <p className="text-muted-foreground dark:text-muted-foreground mt-1">
                        The registered details and current roll of the school you are signed in to.
                    </p>
                </div>
                <Badge
                    variant="outline"
                    className={campus.isActive ? 'text-green-700 bg-green-50 border-green-200' : ''}
                >
                    {campus.isActive ? 'Active' : 'Inactive'}
                </Badge>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">{campus.name}</CardTitle>
                    <CardDescription>
                        {campus.code} · {campus.institutionType}
                        {location ? ` · ${location}` : ''} · On ScholarMind since{' '}
                        {formatDate(campus.createdAt)}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                        <div>
                            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                                {counts.activeStudents}
                            </div>
                            <div className="text-sm text-muted-foreground dark:text-muted-foreground">Active students</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                                {counts.staffAccounts}
                            </div>
                            <div className="text-sm text-muted-foreground dark:text-muted-foreground">Staff logins</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold">{counts.grades}</div>
                            <div className="text-sm text-muted-foreground dark:text-muted-foreground">Grades</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold">{counts.sections}</div>
                            <div className="text-sm text-muted-foreground dark:text-muted-foreground">Sections</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Registration</CardTitle>
                        <CardDescription>As held on the school record.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <DetailRow label="School code" value={campus.code} />
                            <DetailRow label="Institution type" value={campus.institutionType} />
                            <DetailRow label="Affiliation board" value={campus.affiliationBoard} />
                            <DetailRow label="Affiliation number" value={campus.affiliationNumber} />
                            <DetailRow label="UDISE code" value={campus.udiseCode} />
                            <DetailRow label="Billing account" value={campus.companyName} />
                        </dl>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Contact</CardTitle>
                        <CardDescription>Published contact details for this campus.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <DetailRow label="Address" value={campus.address} />
                            <DetailRow label="City" value={campus.city} />
                            <DetailRow label="State" value={campus.state} />
                            <DetailRow label="PIN code" value={campus.pincode} />
                            <DetailRow label="Phone" value={campus.phone} />
                            <DetailRow label="Email" value={campus.email} />
                            <DetailRow label="Website" value={campus.website} />
                        </dl>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Group membership</CardTitle>
                    <CardDescription>
                        Whether this school reports into a multi-campus headquarters.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground dark:text-muted-foreground">
                    {campus.groupName ? (
                        <>
                            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                <DetailRow label="Group" value={campus.groupName} />
                                <DetailRow label="HQ city" value={campus.groupCity} />
                                <DetailRow label="Region" value={campus.region} />
                            </dl>
                            <p>
                                This campus is registered as a <strong>{campus.campusType}</strong> campus in
                                the group. Mandates pushed down by the group are listed on{' '}
                                <Link
                                    href="/hq-policies"
                                    className="text-primary hover:underline"
                                >
                                    HQ Policies
                                </Link>
                                .
                            </p>
                        </>
                    ) : (
                        <p>
                            This school is not mapped to a multi-campus group, so no group mandates apply to
                            it.
                        </p>
                    )}
                    <p>
                        Only the school you are signed in to is shown here. A campus login cannot read any
                        other school&rsquo;s record, and creating, editing or switching schools is a platform
                        operation that is not available from this screen in this release.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

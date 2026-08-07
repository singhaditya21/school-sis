import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function LtiLaunchPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');
    if (!session.ltiLaunch || !['STUDENT', 'TEACHER'].includes(session.role)) {
        redirect('/unauthorized');
    }

    const launch = session.ltiLaunch;
    const workspaceHref = session.role === 'TEACHER'
        ? '/teacher/my-classes'
        : '/student/homework';

    return (
        <main className="min-h-screen bg-slate-50 px-6 py-16">
            <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
                    Verified LTI 1.3 launch
                </p>
                <h1 className="mt-3 text-3xl font-bold text-slate-900">
                    {launch.courseTitle || launch.courseLabel || 'Course workspace'}
                </h1>
                <p className="mt-3 text-slate-600">
                    Your signed LMS identity is linked to {session.email}. Course access uses your
                    local {session.role.toLowerCase()} permissions.
                </p>
                <dl className="mt-8 grid gap-3 rounded-xl bg-slate-50 p-5 text-sm">
                    <div className="flex justify-between gap-6">
                        <dt className="font-medium text-slate-500">Course ID</dt>
                        <dd className="break-all text-right text-slate-900">{launch.courseId}</dd>
                    </div>
                    {launch.courseLabel ? (
                        <div className="flex justify-between gap-6">
                            <dt className="font-medium text-slate-500">Course label</dt>
                            <dd className="text-right text-slate-900">{launch.courseLabel}</dd>
                        </div>
                    ) : null}
                </dl>
                <Link
                    href={workspaceHref}
                    className="mt-8 inline-flex rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                >
                    Continue to School SIS
                </Link>
            </section>
        </main>
    );
}

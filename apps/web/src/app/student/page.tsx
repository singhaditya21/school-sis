import Link from 'next/link';

/**
 * The student portal is not part of this release. Every screen beneath it is
 * still mock data, and /student had no root page at all, so signing in as a
 * student produced a 404. This states the position plainly instead.
 */
export default function StudentHome() {
    return (
        <div className="mx-auto max-w-xl px-6 py-16 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Student portal isn&apos;t available yet</h1>
            <p className="mt-3 text-gray-600">
                Student accounts can sign in, but the student experience is still being built.
                Fees, attendance, results and transport are available to parents today.
            </p>
            <Link
                href="/overview"
                className="mt-6 inline-flex rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
                Go to the parent portal
            </Link>
        </div>
    );
}

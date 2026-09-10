import Link from 'next/link';

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-slate-50 px-4 pb-24 pt-32 text-slate-700">
            <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm md:p-12">
                <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">Privacy Notice</p>
                <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900">Demo and pilot enquiries</h1>
                <p className="mt-6 leading-7">
                    When you request a demo, we use your name, work email, institution, capacity range, and the information you choose to provide to assess pilot fit and respond to your enquiry.
                </p>
                <p className="mt-4 leading-7">
                    We retain submission time, campaign attribution, and a pseudonymous network identifier to prevent abuse and document consent. Access is limited to authorized commercial and platform administrators.
                </p>
                <p className="mt-4 leading-7">
                    You may ask us to correct or delete an enquiry, or stop follow-up communication, by replying to a Scholar Mind email or contacting the address provided during the engagement.
                </p>
                <Link href="/book-demo" className="mt-8 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700">
                    Return to demo request
                </Link>
            </article>
        </main>
    );
}

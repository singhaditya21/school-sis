import Link from 'next/link';
import { createLead } from '@/lib/actions/admissions';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export default async function NewAdmissionLeadPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    return (
        <div className="max-w-lg mx-auto">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground dark:text-white">New Admission Lead</h1>
                    <p className="text-muted-foreground mt-1">Add a new prospective student inquiry</p>
                </div>
                <Link href="/admissions" className="text-primary hover:underline text-sm">
                    ← Back
                </Link>
            </div>

            <form action={createLead} className="space-y-6">
                {/* Child Information */}
                <div className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-border dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-foreground dark:text-white mb-4">Child Information</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">First Name *</label>
                            <input type="text" name="childFirstName" required placeholder="First name"
                                className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-ring" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Last Name *</label>
                            <input type="text" name="childLastName" required placeholder="Last name"
                                className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-ring" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Date of Birth</label>
                            <input type="date" name="childDob"
                                className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-ring" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Applying for Grade *</label>
                            <input type="text" name="applyingForGrade" required placeholder="e.g., Grade 1"
                                className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-ring" />
                        </div>
                    </div>
                </div>

                {/* Parent Information */}
                <div className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-border dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-foreground dark:text-white mb-4">Parent / Guardian</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Parent&apos;s Name *</label>
                            <input type="text" name="parentName" required placeholder="Full name"
                                className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-ring" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Phone *</label>
                                <input type="tel" name="parentPhone" required placeholder="+91 9876543210"
                                    className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-ring" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Email *</label>
                                <input type="email" name="parentEmail" required placeholder="parent@example.com"
                                    className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-ring" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Additional Info */}
                <div className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-border dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-foreground dark:text-white mb-4">Additional Details</h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Lead Source</label>
                                <select name="source"
                                    className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-ring">
                                    <option value="WEBSITE">Website</option>
                                    <option value="WALK_IN">Walk-in</option>
                                    <option value="REFERRAL">Referral</option>
                                    <option value="SOCIAL_MEDIA">Social Media</option>
                                    <option value="ADVERTISEMENT">Advertisement</option>
                                    <option value="OTHER">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Previous School</label>
                                <input type="text" name="previousSchool" placeholder="School name"
                                    className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-ring" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Notes</label>
                            <textarea name="notes" rows={3} placeholder="Any additional notes..."
                                className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-ring" />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                    <Link href="/admissions"
                        className="px-6 py-2 border border-border dark:border-gray-700 rounded-lg text-foreground dark:text-gray-300 hover:bg-muted dark:hover:bg-gray-900">
                        Cancel
                    </Link>
                    <button type="submit"
                        className="flex-1 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium">
                        Create Lead
                    </button>
                </div>
            </form>
        </div>
    );
}

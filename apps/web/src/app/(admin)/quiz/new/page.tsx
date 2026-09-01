import Link from 'next/link';
import { getQuizTargetOptions } from '../queries';
import { createQuizAction } from '../actions';

const inputClass =
    'w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-card text-sm focus:ring-2 focus:ring-ring';
const labelClass = 'block text-sm font-medium text-foreground dark:text-gray-300 mb-1';

export default async function NewQuizPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const { error } = await searchParams;
    const { subjects, grades, sections } = await getQuizTargetOptions();

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Create Quiz</h1>
                    <p className="text-muted-foreground dark:text-muted-foreground mt-1">
                        The quiz starts as a draft. Add questions next, then publish it.
                    </p>
                </div>
                <Link href="/quiz" className="text-primary hover:underline text-sm">← Back</Link>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            <form
                action={createQuizAction}
                className="bg-card rounded-xl shadow-sm border border-border dark:border-gray-800 p-6 space-y-4"
            >
                <div>
                    <label className={labelClass} htmlFor="title">Title *</label>
                    <input id="title" name="title" type="text" required placeholder="e.g. Algebra — Unit 3 Check" className={inputClass} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass} htmlFor="subjectId">Subject</label>
                        <select id="subjectId" name="subjectId" className={inputClass} defaultValue="">
                            <option value="">Not linked to a subject</option>
                            {subjects.map((s) => (
                                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="duration">Duration (minutes) *</label>
                        <input id="duration" name="duration" type="number" min={1} required defaultValue={30} className={inputClass} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass} htmlFor="gradeId">Grade</label>
                        <select id="gradeId" name="gradeId" className={inputClass} defaultValue="">
                            <option value="">All grades</option>
                            {grades.map((g) => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="sectionId">Section</label>
                        <select id="sectionId" name="sectionId" className={inputClass} defaultValue="">
                            <option value="">All sections</option>
                            {sections.map((sec) => (
                                <option key={sec.id} value={sec.id}>
                                    {sec.gradeName ? `${sec.gradeName}-${sec.name}` : sec.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass} htmlFor="startTime">Opens at</label>
                        <input id="startTime" name="startTime" type="datetime-local" className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="endTime">Closes at</label>
                        <input id="endTime" name="endTime" type="datetime-local" className={inputClass} />
                    </div>
                </div>

                <div>
                    <label className={labelClass} htmlFor="instructions">Instructions</label>
                    <textarea id="instructions" name="instructions" rows={3} placeholder="Shown to students before they start." className={inputClass} />
                </div>

                <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                    Total marks are calculated from the questions you add, so there is nothing to enter here.
                </p>

                <button type="submit" className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium">
                    Create Quiz
                </button>
            </form>
        </div>
    );
}

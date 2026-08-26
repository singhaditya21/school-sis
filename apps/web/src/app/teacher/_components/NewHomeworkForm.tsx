'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createMyHomework, type TeachingSlot } from '../_actions/homework';

export function NewHomeworkForm({ slots }: { slots: TeachingSlot[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [slotIndex, setSlotIndex] = useState('0');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [maxMarks, setMaxMarks] = useState('');
    const [pending, startTransition] = useTransition();

    if (slots.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border p-5 text-sm text-gray-600">
                Homework is attached to a subject you teach in a specific section. You have no timetabled
                periods, so there is nothing to set homework against yet.
            </div>
        );
    }

    function submit() {
        const slot = slots[Number(slotIndex)];
        if (!slot) {
            toast.error('Pick one of your classes.');
            return;
        }

        startTransition(async () => {
            const result = await createMyHomework({
                title,
                description,
                sectionId: slot.sectionId,
                subjectId: slot.subjectId,
                dueDate,
                maxMarks,
            });

            if (result.success) {
                toast.success('Homework set.');
                setTitle('');
                setDescription('');
                setDueDate('');
                setMaxMarks('');
                setOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not create the homework.');
            }
        });
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
                Set homework
            </button>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4 w-full">
            <h2 className="font-semibold text-gray-900">Set homework</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm">
                    <span className="block mb-1 text-gray-600">Class and subject</span>
                    <select
                        value={slotIndex}
                        onChange={(e) => setSlotIndex(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                        {slots.map((slot, index) => (
                            <option key={`${slot.sectionId}-${slot.subjectId}`} value={String(index)}>
                                {slot.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="text-sm">
                    <span className="block mb-1 text-gray-600">Due date</span>
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                </label>

                <label className="text-sm md:col-span-2">
                    <span className="block mb-1 text-gray-600">Title</span>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Exercise 4.2, questions 1–10"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                </label>

                <label className="text-sm md:col-span-2">
                    <span className="block mb-1 text-gray-600">Instructions (optional)</span>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                </label>

                <label className="text-sm">
                    <span className="block mb-1 text-gray-600">Max marks (optional)</span>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={maxMarks}
                        onChange={(e) => setMaxMarks(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                </label>
            </div>

            <p className="text-xs text-gray-500">
                Attachments are not supported here — the file store for homework is not wired up, so this form
                does not offer an upload it cannot honour.
            </p>

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={submit}
                    disabled={pending}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium"
                >
                    {pending ? 'Saving…' : 'Save homework'}
                </button>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

'use client';

import { useState } from 'react';
import { createCoachingBatch } from '@/actions/coaching';
import { v4 as uuidv4 } from 'uuid'; // Mocking tenant ID for UI demonstration

export default function CreateBatchForm() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    async function formAction(formData: FormData) {
        setIsSubmitting(true);
        setMessage(null);
        
        // Inject a mock tenant ID to satisfy the Drizzle schema constraints for this demo
        formData.append('tenantId', uuidv4());

        const result = await createCoachingBatch(formData);

        if (result.success) {
            setMessage({ type: 'success', text: `Batch "${result.data?.name}" created successfully!` });
            (document.getElementById('coaching-batch-form') as HTMLFormElement).reset();
        } else {
            console.error(result.errors || result.message);
            setMessage({ type: 'error', text: result.message || 'Validation failed. Check console.' });
        }
        setIsSubmitting(false);
    }

    return (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 mt-8">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Create New Coaching Batch</h2>
            
            {message && (
                <div className={`p-4 mb-6 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {message.text}
                </div>
            )}

            <form id="coaching-batch-form" action={formAction} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Batch Name</label>
                        <input 
                            name="name" 
                            type="text" 
                            required 
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                            placeholder="e.g. Super 30 - JEE 2027"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Target Exam</label>
                        <select 
                            name="examTarget" 
                            required 
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition bg-white"
                        >
                            <option value="JEE">JEE (Mains + Advanced)</option>
                            <option value="NEET">NEET (UG)</option>
                            <option value="UPSC">UPSC CSE</option>
                            <option value="CAT">CAT / MBA</option>
                            <option value="CLAT">CLAT (Law)</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
                        <input 
                            name="startDate" 
                            type="date" 
                            required 
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Max Capacity</label>
                        <input 
                            name="capacity" 
                            type="number" 
                            min="1" 
                            max="500"
                            required 
                            defaultValue={40}
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                        />
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-200"
                    >
                        {isSubmitting ? 'Provisioning Batch...' : 'Create Batch'}
                    </button>
                </div>
            </form>
        </div>
    );
}

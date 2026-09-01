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
        
        // Demo form: inject a mock tenant ID (the server action validates it as a
        // UUID; RLS on the routing pool still enforces the real request tenant).
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
        <div className="bg-card p-8 rounded-2xl shadow-sm border border-border mt-8">
            <h2 className="text-2xl font-bold text-foreground mb-6">Create New Coaching Batch</h2>
            
            {message && (
                <div className={`p-4 mb-6 rounded-lg border ${message.type === 'success' ? 'bg-success-subtle text-success-subtle-foreground border-success/20' : 'bg-destructive-subtle text-destructive-subtle-foreground border-destructive/20'}`}>
                    {message.text}
                </div>
            )}

            <form id="coaching-batch-form" action={formAction} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Batch Name</label>
                        <input 
                            name="name" 
                            type="text" 
                            required 
                            className="w-full p-3 border border-border rounded-xl focus:ring-2 focus:ring-ring outline-none transition"
                            placeholder="e.g. Super 30 - JEE 2027"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Target Exam</label>
                        <select 
                            name="examTarget" 
                            required 
                            className="w-full p-3 border border-border rounded-xl focus:ring-2 focus:ring-ring outline-none transition bg-card"
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
                        <label className="block text-sm font-medium text-foreground mb-2">Start Date</label>
                        <input 
                            name="startDate" 
                            type="date" 
                            required 
                            className="w-full p-3 border border-border rounded-xl focus:ring-2 focus:ring-ring outline-none transition"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">End Date</label>
                        <input
                            name="endDate"
                            type="date"
                            required
                            className="w-full p-3 border border-border rounded-xl focus:ring-2 focus:ring-ring outline-none transition"
                        />
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20"
                    >
                        {isSubmitting ? 'Provisioning Batch...' : 'Create Batch'}
                    </button>
                </div>
            </form>
        </div>
    );
}

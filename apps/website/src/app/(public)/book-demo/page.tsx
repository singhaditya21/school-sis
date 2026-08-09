'use client';

import { useState } from 'react';
import { CheckCircle, Building } from 'lucide-react';
import Link from 'next/link';

export default function BookDemoPage() {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errMsg, setErrMsg] = useState('');

    async function handleSubmit(formData: FormData) {
        setStatus('loading');
        setErrMsg('');

        const API_URL = process.env.NEXT_PUBLIC_API_URL;
        if (!API_URL) {
            setErrMsg('The lead service is not configured for this environment.');
            setStatus('error');
            return;
        }
        
        try {
            const res = await fetch(`${API_URL}/api/leads`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            
            if (!res.ok || data.error) {
                setErrMsg(data.error || 'Failed to submit route.');
                setStatus('error');
            } else {
                setStatus('success');
            }
        } catch {
            setErrMsg('The lead service is unavailable. Please try again later.');
            setStatus('error');
        }
    }

    if (status === 'success') {
        return (
            <div className="min-h-screen bg-slate-50 pt-32 pb-24 flex items-center justify-center animate-fade-in">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-10 max-w-lg w-full text-center">
                    <CheckCircle className="w-20 h-20 text-emerald-500 mx-auto mb-6" />
                    <h2 className="text-3xl font-black text-slate-900 mb-4">Demo Requested.</h2>
                    <p className="text-slate-500 mb-8">Your request was accepted by the ScholarMind lead service. Our team will use the contact details you supplied to arrange a scoped working session.</p>
                    <Link href="/" className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-indigo-700 transition block w-full">
                        Return home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pt-28 pb-24 animate-fade-in relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[100px]"></div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    
                    <div>
                        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-6">
                            <Building size={24} />
                        </div>
                        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-6">Talk to our campus engineers.</h1>
                        <p className="text-lg text-slate-500 mb-8 leading-relaxed">
                            We will review your institution hierarchy, current systems, migration constraints, and the first operational workflow that needs to become production-ready.
                        </p>
                        
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="mt-1"><CheckCircle className="text-emerald-500" size={20} /></div>
                                <div>
                                    <h4 className="font-bold text-slate-900">Current-state architecture review</h4>
                                    <p className="text-slate-500 text-sm">Map systems of record, integrations, data owners, and coexistence constraints.</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="mt-1"><CheckCircle className="text-emerald-500" size={20} /></div>
                                <div>
                                    <h4 className="font-bold text-slate-900">Pilot scope and release gates</h4>
                                    <p className="text-slate-500 text-sm">Define the users, workflows, migration evidence, and providers required for a credible pilot.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-8 md:p-10">
                        <form action={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="contactName" className="block text-sm font-bold text-slate-700 mb-2">Full Name</label>
                                    <input id="contactName" type="text" name="contactName" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="Jane Doe" />
                                </div>
                                <div>
                                    <label htmlFor="contactEmail" className="block text-sm font-bold text-slate-700 mb-2">Work Email</label>
                                    <input id="contactEmail" type="email" name="contactEmail" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="jane@school.edu" />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="schoolName" className="block text-sm font-bold text-slate-700 mb-2">Institution Name</label>
                                <input id="schoolName" type="text" name="schoolName" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="Franklin High Network" />
                            </div>

                            <div>
                                <label htmlFor="studentCapacity" className="block text-sm font-bold text-slate-700 mb-2">Total Student Capacity</label>
                                <select id="studentCapacity" name="studentCapacity" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition">
                                    <option value="">Select an estimate...</option>
                                    <option value="500">Under 500</option>
                                    <option value="1500">500 - 1,500</option>
                                    <option value="5000">1,500 - 5,000</option>
                                    <option value="10000">More than 5,000 (Multi-Campus)</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="painPoints" className="block text-sm font-bold text-slate-700 mb-2">Biggest Administrative Hurdle</label>
                                <textarea id="painPoints" name="painPoints" rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="e.g. duplicated records, fragmented fee operations, or a difficult migration"></textarea>
                            </div>

                            {status === 'error' && (
                                <div className="p-4 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 text-sm font-medium">
                                    {errMsg}
                                </div>
                            )}

                            <button type="submit" disabled={status === 'loading'} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition disabled:opacity-70 flex justify-center items-center">
                                {status === 'loading' ? 'Submitting request…' : 'Request working session'}
                            </button>
                        </form>
                    </div>

                </div>
            </div>
        </div>
    );
}

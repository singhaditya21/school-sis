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

        // Point to the Core Web App API endpoint (using env var locally vs production)
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        
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
        } catch (e) {
            setErrMsg('Network error executing API bridging.');
            setStatus('error');
        }
    }

    if (status === 'success') {
        return (
            <div className="min-h-screen bg-slate-50 pt-32 pb-24 flex items-center justify-center animate-fade-in">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-10 max-w-lg w-full text-center">
                    <CheckCircle className="w-20 h-20 text-emerald-500 mx-auto mb-6" />
                    <h2 className="text-3xl font-black text-slate-900 mb-4">Demo Requested.</h2>
                    <p className="text-slate-500 mb-8">Our enterprise sales team has received your details. We will email you within 24 hours to schedule a custom walkthrough of the Scholar Mind architecture.</p>
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
                            Instead of standard salespeople, you&apos;ll be meeting with our deployment engineers. We will analyze your exact database fragmentations and show you a custom instance predicting real churn and fee defaults.
                        </p>
                        
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="mt-1"><CheckCircle className="text-emerald-500" size={20} /></div>
                                <div>
                                    <h4 className="font-bold text-slate-900">Custom Architecture Review</h4>
                                    <p className="text-slate-500 text-sm">We map how Scholar Mind replaces your existing tools.</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="mt-1"><CheckCircle className="text-emerald-500" size={20} /></div>
                                <div>
                                    <h4 className="font-bold text-slate-900">Live AI Walkthrough</h4>
                                    <p className="text-slate-500 text-sm">See the 26 agents operating on a massive dataset.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-8 md:p-10">
                        <form action={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Full Name</label>
                                    <input type="text" name="contactName" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="Jane Doe" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Work Email</label>
                                    <input type="email" name="contactEmail" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="jane@school.edu" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Institution Name</label>
                                <input type="text" name="schoolName" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="Franklin High Network" />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Total Student Capacity</label>
                                <select name="studentCapacity" required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition">
                                    <option value="">Select an estimate...</option>
                                    <option value="500">Under 500</option>
                                    <option value="1500">500 - 1,500</option>
                                    <option value="5000">1,500 - 5,000</option>
                                    <option value="10000">More than 5,000 (Multi-Campus)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Biggest Administrative Hurdle</label>
                                <textarea name="painPoints" rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="e.g. Too many manual excel sheets, fee defaults are causing cash flow issues..."></textarea>
                            </div>

                            {status === 'error' && (
                                <div className="p-4 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 text-sm font-medium">
                                    {errMsg}
                                </div>
                            )}

                            <button type="submit" disabled={status === 'loading'} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition disabled:opacity-70 flex justify-center items-center">
                                {status === 'loading' ? 'Encrypting & Routing...' : 'Request VIP Demo'}
                            </button>
                        </form>
                    </div>

                </div>
            </div>
        </div>
    );
}

'use client';

import { useState } from 'react';
import { Calculator, Clock, DollarSign, Zap } from 'lucide-react';

export default function ROICalculator() {
    const [students, setStudents] = useState(500);

    // Estimation logic
    const manualHoursPerStudent = 2.5; // per year
    const aiHoursPerStudent = 0.5;
    const adminHourlyRate = 25;
    const softwareCostsConsolidated = students * 15; // Estimated $15/student for varied legacy tools

    const hoursSaved = (manualHoursPerStudent - aiHoursPerStudent) * students;
    const moneySavedTime = hoursSaved * adminHourlyRate;
    const totalValueCreated = moneySavedTime + softwareCostsConsolidated;

    return (
        <div className="bg-white rounded-3xl border border-indigo-100 shadow-2xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-bl-full z-0 opacity-50"></div>
            
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12">
                <div>
                    <h3 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                        <Calculator className="text-indigo-600" size={32} />
                        Interactive ROI Engine
                    </h3>
                    <p className="text-slate-500 mt-2">Adjust the slider to your campus size and see exact administrative telemetry savings instantly.</p>

                    <div className="mt-10">
                        <div className="flex justify-between items-end mb-4">
                            <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">Total Active Students</span>
                            <span className="text-3xl font-black text-indigo-600">{students.toLocaleString()}</span>
                        </div>
                        <input 
                            type="range" 
                            min="100" 
                            max="5000" 
                            step="50"
                            value={students} 
                            onChange={(e) => setStudents(Number(e.target.value))}
                            className="w-full h-3 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium">
                            <span>100</span>
                            <span>2,500</span>
                            <span>5,000+</span>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-200 pb-2">Annual Impact Estimate</h4>
                    
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                                <Clock size={24} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{hoursSaved.toLocaleString()} hrs</p>
                                <p className="text-sm text-slate-500">Manual admin labor recovered via AI</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                <DollarSign size={24} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">${softwareCostsConsolidated.toLocaleString()}</p>
                                <p className="text-sm text-slate-500">Legacy fragmented license costs avoided</p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-200">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-600/20">
                                    <Zap size={24} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-emerald-600 uppercase tracking-widest">Gross Value Created</p>
                                    <p className="text-4xl font-black text-slate-900">${totalValueCreated.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

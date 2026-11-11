'use client';

import { useState } from 'react';
import { Calculator, Clock, DollarSign, Zap } from 'lucide-react';

export default function ROICalculator() {
    const [students, setStudents] = useState(500);

    const manualHoursPerStudent = 2.5;
    const aiHoursPerStudent = 0.5;
    const adminHourlyRate = 25;
    const softwareCostsConsolidated = students * 15;

    const hoursSaved = (manualHoursPerStudent - aiHoursPerStudent) * students;
    const moneySavedTime = hoursSaved * adminHourlyRate;
    const totalValueCreated = moneySavedTime + softwareCostsConsolidated;

    return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-lg p-8 md:p-12 relative overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-oxford via-brass to-oxford absolute top-0 left-0" />

            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12">
                <div>
                    <h3 className="text-3xl font-extrabold text-oxford flex items-center gap-3">
                        <Calculator className="text-brass" size={30} />
                        Interactive ROI Engine
                    </h3>
                    <p className="text-slate-600 mt-2">
                        Adjust the slider to your campus size and see administrative reconciliation savings immediately.
                    </p>

                    <div className="mt-10">
                        <div className="flex justify-between items-end mb-4">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Total Active Students
                            </span>
                            <span className="text-3xl font-black tabular-nums text-oxford">
                                {students.toLocaleString()}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="100"
                            max="5000"
                            step="50"
                            value={students}
                            onChange={(e) => setStudents(Number(e.target.value))}
                            className="w-full h-3 bg-parchment rounded-lg appearance-none cursor-pointer accent-oxford"
                        />
                        <div className="flex justify-between text-xs text-slate-500 mt-2 font-medium tabular-nums">
                            <span>100</span>
                            <span>2,500</span>
                            <span>5,000+</span>
                        </div>
                    </div>
                </div>

                <div className="bg-ivory rounded-2xl p-6 border border-brass/30">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-200 pb-2">
                        Annual Impact Estimate
                    </h4>

                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-parchment text-brass flex items-center justify-center shrink-0">
                                <Clock size={22} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold tabular-nums text-oxford">
                                    {hoursSaved.toLocaleString()} hrs
                                </p>
                                <p className="text-sm text-slate-600">Manual reconciliation labor recovered</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-oxford/10 text-oxford flex items-center justify-center shrink-0">
                                <DollarSign size={22} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold tabular-nums text-oxford">
                                    ${softwareCostsConsolidated.toLocaleString()}
                                </p>
                                <p className="text-sm text-slate-600">Fragmented legacy tool spend consolidated</p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-200">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-oxford text-ivory flex items-center justify-center shrink-0 shadow-xs">
                                    <Zap size={22} className="text-brass-light" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-brass uppercase tracking-widest">
                                        Gross Value Created
                                    </p>
                                    <p className="text-4xl font-black tabular-nums text-oxford">
                                        ${totalValueCreated.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

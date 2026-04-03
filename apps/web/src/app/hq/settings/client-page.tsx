'use client';

import React, { useState } from 'react';
import { Sliders, Cpu, Save, Database, Key } from 'lucide-react';

export default function SettingsClient() {
    const [configs, setConfigs] = useState({
        allowNewTenants: true,
        enforceHardwareKeys: false,
        aiTokenMultiplier: 1.5,
        defaultStorageGB: 50,
    });

    const handleSave = () => {
        // Mock save
        alert("Global configuration synchronized to Core Ledger.");
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Global Policy Engine</h1>
                    <p className="text-sm text-slate-400 mt-1">Platform-wide constraints and multi-tenant telemetry boundary controls.</p>
                </div>
                <button 
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    <Save className="w-4 h-4" /> 
                    Commit Parameters
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Deployment Control */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                            <Sliders className="w-5 h-5 text-indigo-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">SaaS Deployment Engine</h3>
                    </div>
                    
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-200">Autonomous Provisioning</p>
                                <p className="text-xs text-slate-500 mt-0.5">Allow public Stripe checkouts to create nodes.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={configs.allowNewTenants} onChange={(e) => setConfigs({...configs, allowNewTenants: e.target.checked})} />
                                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                        
                        <div className="pt-4 border-t border-slate-800">
                             <div>
                                <p className="text-sm font-medium text-slate-200 mb-2">Base Container Storage (GB)</p>
                                <input 
                                    type="number" 
                                    value={configs.defaultStorageGB} 
                                    onChange={(e) => setConfigs({...configs, defaultStorageGB: Number(e.target.value)})}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* AI Compute Restrictions */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-cyan-500/10 rounded-lg">
                            <Cpu className="w-5 h-5 text-cyan-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">AI Throttle Engine</h3>
                    </div>
                    
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between mb-2">
                                <p className="text-sm font-medium text-slate-200">Global Burn Multiplier</p>
                                <span className="text-xs font-mono text-cyan-400">{configs.aiTokenMultiplier}x</span>
                            </div>
                            <input 
                                type="range" 
                                min="0.5" 
                                max="5.0" 
                                step="0.1" 
                                value={configs.aiTokenMultiplier}
                                onChange={(e) => setConfigs({...configs, aiTokenMultiplier: parseFloat(e.target.value)})}
                                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                            <p className="text-xs text-slate-500 mt-2">Adjusts real-time cost throttling for GPT-4 queries across all agent instances.</p>
                        </div>
                    </div>
                </div>

                 {/* Security Guardrails */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 md:col-span-2">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-red-500/10 rounded-lg">
                            <Key className="w-5 h-5 text-red-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">Cryptographic Policies</h3>
                    </div>
                    
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-200">Hardware Security Enforcement (WebAuthn)</p>
                                <p className="text-xs text-slate-500 mt-0.5">Force all SUPER_ADMIN accounts to register biometric YubiKeys.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={configs.enforceHardwareKeys} onChange={(e) => setConfigs({...configs, enforceHardwareKeys: e.target.checked})} />
                                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

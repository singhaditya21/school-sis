'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, X, Building2, Zap, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function PricingPage() {
    const router = useRouter();
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

    const handleCheckout = async (planType: string, priceId: string) => {
        setLoadingPlan(planType);
        try {
            // Initiate a checkout session
            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceId, planType }),
            });

            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                console.error(data.error);
                // Usually unauthorized without a tenant. In a real flow, redirect to /setup
                alert(data.error === 'Unauthorized' ? 'Please create your school account first.' : data.error);
                if (data.error === 'Unauthorized') router.push('/setup');
            }
        } catch (error) {
            console.error('Checkout failed:', error);
        } finally {
            setLoadingPlan(null);
        }
    };

    const isAnnual = billingCycle === 'annually';

    const renderPrice = (monthlyPrice: number) => {
        const p = isAnnual ? monthlyPrice * 0.8 : monthlyPrice; // 20% discount
        return (
            <span className="text-4xl font-extrabold tracking-tight">
                ${Math.floor(p)}
                <span className="text-lg font-medium text-gray-500 tracking-normal"> /mo</span>
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50/50 py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto space-y-16">
                <div className="text-center space-y-6 max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
                        Simple, transparent pricing for every school.
                    </h1>
                    <p className="text-lg md:text-xl text-slate-600">
                        Whether you are a local academy or a multi-campus university, ScholarMind scales with your operational needs.
                    </p>
                    
                    {/* Toggle */}
                    <div className="flex items-center justify-center pt-4">
                        <div className="relative flex p-1 bg-slate-100 rounded-full border border-slate-200">
                            <button
                                onClick={() => setBillingCycle('monthly')}
                                className={`relative w-32 py-2 text-sm font-semibold rounded-full transition-colors ${!isAnnual ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}
                            >
                                Monthly
                            </button>
                            <button
                                onClick={() => setBillingCycle('annually')}
                                className={`relative w-32 py-2 text-sm font-semibold rounded-full transition-colors ${isAnnual ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}
                            >
                                Annually <span className="absolute -top-3 -right-3 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-full tracking-wide">SAVE 20%</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    <PricingCard 
                        title="Core"
                        icon={<Building2 className="w-6 h-6 text-blue-500" />}
                        description="Essential tools for small schools to manage academics, attendance, and basic fees."
                        priceComponent={renderPrice(99)}
                        priceId={isAnnual ? 'price_core_annual_mock' : 'price_core_monthly_mock'}
                        features={[
                            { text: 'Up to 250 Students', included: true },
                            { text: 'Automated Attendance', included: true },
                            { text: 'Basic Fee Management', included: true },
                            { text: 'Row-Level Database Security', included: true },
                            { text: 'Library Management', included: false },
                            { text: 'AI Timetable Generation', included: false },
                            { text: 'Transport GPS Tracking', included: false },
                        ]}
                        buttonText="Start Free 14-Day Trial"
                        planType="CORE"
                        loading={loadingPlan === 'CORE'}
                        onSelect={handleCheckout}
                    />

                    <PricingCard 
                        title="AI Pro"
                        highlighted
                        icon={<Zap className="w-6 h-6 text-amber-500" />}
                        description="Unlock full operational automation, automated library, inventory, and AI-driven workflows."
                        priceComponent={renderPrice(249)}
                        priceId={isAnnual ? 'price_pro_annual_mock' : 'price_pro_monthly_mock'}
                        features={[
                            { text: 'Up to 1,000 Students', included: true },
                            { text: 'Library & Inventory Audits', included: true },
                            { text: 'Automated Timetabling AI', included: true },
                            { text: 'Transport GPS Tracking', included: true },
                            { text: 'SaaS WhatsApp Integrations', included: true },
                            { text: 'Advanced API Webhooks', included: true },
                            { text: 'Custom Enterprise Domains', included: false },
                        ]}
                        buttonText="Get AI Pro"
                        planType="AI_PRO"
                        loading={loadingPlan === 'AI_PRO'}
                        onSelect={handleCheckout}
                    />

                    <PricingCard 
                        title="Enterprise"
                        icon={<ShieldAlert className="w-6 h-6 text-indigo-500" />}
                        description="Dedicated compliance, massive scale, Multi-Campus mapping, and custom DPDPA engines."
                        priceComponent={renderPrice(599)}
                        priceId={isAnnual ? 'price_enterprise_annual_mock' : 'price_enterprise_monthly_mock'}
                        features={[
                            { text: 'Unlimited Students', included: true },
                            { text: 'Multi-Campus Hierarchy', included: true },
                            { text: 'Dedicated Account Manager', included: true },
                            { text: 'DPDPA Legal Compliance Vault', included: true },
                            { text: 'Custom Internal Branding', included: true },
                            { text: 'Private Cloud Isolation', included: true },
                            { text: '99.99% Guaranteed SLA', included: true },
                        ]}
                        buttonText="Contact Sales"
                        planType="ENTERPRISE"
                        loading={loadingPlan === 'ENTERPRISE'}
                        onSelect={handleCheckout}
                    />
                </div>
            </div>
        </div>
    );
}

function PricingCard({ 
    title, icon, description, priceComponent, features, buttonText, highlighted = false, planType, priceId, onSelect, loading
}: { 
    title: string, icon: React.ReactNode, description: string, priceComponent: React.ReactNode, features: {text: string, included: boolean}[], buttonText: string, highlighted?: boolean, planType: string, priceId: string, onSelect: (plan: string, priceId: string) => void, loading: boolean
}) {
    return (
        <div className={`relative flex flex-col bg-white rounded-3xl p-8 border ${highlighted ? 'border-amber-400 shadow-2xl shadow-amber-900/10 scale-105 z-10' : 'border-slate-200 shadow-lg shadow-slate-200/50'}`}>
            {highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-amber-400 to-amber-600 text-white font-bold tracking-wide px-3 py-1 shadow-md">MOST POPULAR</Badge>
                </div>
            )}
            
            <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-xl ${highlighted ? 'bg-amber-100' : 'bg-slate-100'}`}>
                    {icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900">{title}</h3>
            </div>
            
            <p className="text-slate-500 text-sm min-h-[60px]">{description}</p>
            
            <div className="mt-4 mb-8">
                {priceComponent}
            </div>
            
            <Button 
                onClick={() => onSelect(planType, priceId)}
                className={`w-full py-6 text-md font-semibold rounded-xl mb-8 transition-transform hover:scale-[1.02] ${highlighted ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                disabled={loading}
            >
                {loading ? <span className="animate-pulse">Redirecting to Stripe...</span> : buttonText}
            </Button>
            
            <div className="flex-1 space-y-4">
                <p className="font-semibold text-sm text-slate-900">What's included</p>
                <ul className="space-y-3">
                    {features.map((f, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                            <div className="mt-0.5">
                                {f.included ? <Check className="w-5 h-5 text-green-500" /> : <X className="w-5 h-5 text-slate-300" />}
                            </div>
                            <span className={`text-sm ${f.included ? 'text-slate-700' : 'text-slate-400 line-through'}`}>{f.text}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

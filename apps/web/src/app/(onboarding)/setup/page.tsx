'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Mail, Lock, User, Globe, ArrowRight } from 'lucide-react';
import { setupSchoolWorkspace } from '@/lib/actions/onboarding';

export default function SetupWorkspacePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        
        try {
            const res = await setupSchoolWorkspace(formData);
            if (res.error) {
                setError(res.error);
                setLoading(false);
            } else {
                // Successfully created tenant and signed in
                // Immediate redirect to pricing for checkout
                router.push('/pricing');
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg transform -rotate-6">
                        <Building2 className="h-8 w-8 text-white transform rotate-6" />
                    </div>
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
                    Onboard your school
                </h2>
                <p className="mt-2 text-center text-sm text-slate-600">
                    Set up your dedicated workspace in seconds.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
                <Card className="border-0 shadow-2xl shadow-blue-900/5 ring-1 ring-slate-200">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl">Workspace Details</CardTitle>
                        <CardDescription>We'll provision an isolated database for your data.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            
                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-start">
                                    <span className="mr-2">⚠️</span> {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="schoolName" className="block text-sm font-medium text-slate-700">Official School Name</label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Building2 className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <Input
                                            type="text"
                                            name="schoolName"
                                            id="schoolName"
                                            required
                                            className="pl-10 block w-full sm:text-sm h-11"
                                            placeholder="St. Jude's Academy"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="adminFirstName" className="block text-sm font-medium text-slate-700">Admin First Name</label>
                                        <div className="mt-1 relative rounded-md">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <User className="h-5 w-5 text-slate-400" />
                                            </div>
                                            <Input required type="text" name="adminFirstName" className="pl-10 h-11" placeholder="John" />
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="adminLastName" className="block text-sm font-medium text-slate-700">Admin Last Name</label>
                                        <Input required type="text" name="adminLastName" className="mt-1 h-11" placeholder="Doe" />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-slate-700">Admin Email Address</label>
                                    <div className="mt-1 relative rounded-md">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Mail className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <Input required type="email" name="email" className="pl-10 h-11" placeholder="admin@stjudes.edu" />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="domain" className="block text-sm font-medium text-slate-700">Workspace Custom Domain URL</label>
                                    <div className="mt-1 relative rounded-md flex">
                                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-slate-300 bg-slate-50 text-slate-500 sm:text-sm">
                                            https://
                                        </span>
                                        <Input required type="text" name="domain" className="flex-1 rounded-none rounded-r-md h-11" placeholder="stjudes" />
                                        <span className="inline-flex items-center px-3 rounded-l-md border border-l-0 border-slate-300 bg-slate-50 text-slate-500 sm:text-sm">
                                            .scholarmind.app
                                        </span>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="password" className="block text-sm font-medium text-slate-700">Secure Password</label>
                                    <div className="mt-1 relative rounded-md">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Lock className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <Input required type="password" name="password" className="pl-10 h-11" placeholder="••••••••" minLength={8} />
                                    </div>
                                </div>
                            </div>

                            <Button 
                                type="submit" 
                                disabled={loading}
                                className="w-full flex justify-center py-6 border border-transparent rounded-xl shadow-sm text-md font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all"
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                        Provisioning Database...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        Create Workspace & Continue <ArrowRight className="w-5 h-5" />
                                    </span>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
                <p className="mt-8 text-center text-sm text-slate-500 max-w-sm mx-auto">
                    By proceeding, you agree to ScholarMind's Terms of Service and DPDPA/GDPR Data Processing Addendum.
                </p>
            </div>
        </div>
    );
}

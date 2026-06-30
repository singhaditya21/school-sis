import React from 'react';
import { pool } from '../../../../lib/db/client';
import { Building2, Globe, CheckCircle2, ArrowRight } from 'lucide-react';
import { redirect } from 'next/navigation';

export default function SchoolRegistrationPage() {

  // Server Action to handle the PLG registration
  async function registerSchool(formData: FormData) {
    'use server';
    const name = formData.get('schoolName') as string;
    const domain = formData.get('emailDomain') as string;
    
    if (!name || !domain) return;

    try {
      // Create the tenant
      const res = await pool.query(
        \`INSERT INTO tenants (name, domain) VALUES ($1, $2) RETURNING id\`,
        [name, domain]
      );
      
      // Auto-unlock the NextAuth security for this domain
      // Now anyone with @domain can login and will be assigned this tenant_id
      
    } catch (err) {
      console.error("Failed to register tenant:", err);
      return; // Could handle unique constraint errors here
    }

    // Redirect to the login page
    redirect('/api/auth/signin');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
            <Building2 className="w-7 h-7 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          Register your School
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Get the Core SIS for free, forever. No credit card required.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl border border-slate-100 sm:rounded-2xl sm:px-10 relative overflow-hidden">
          
          <form action={registerSchool} className="space-y-6 relative z-10">
            <div>
              <label htmlFor="schoolName" className="block text-sm font-medium text-slate-700">
                School Name
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Building2 className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  name="schoolName"
                  id="schoolName"
                  required
                  placeholder="Springfield High School"
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-3 bg-slate-50 border"
                />
              </div>
            </div>

            <div>
              <label htmlFor="emailDomain" className="block text-sm font-medium text-slate-700">
                Official Email Domain
              </label>
              <p className="text-xs text-slate-500 mb-2 mt-1">
                Anyone logging in with this Google domain will automatically join your school.
              </p>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Globe className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  name="emailDomain"
                  id="emailDomain"
                  required
                  placeholder="springfield.edu"
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-3 bg-slate-50 border"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                Create Workspace
                <ArrowRight className="ml-2 w-4 h-4" />
              </button>
            </div>
          </form>
          
          <div className="mt-8 pt-6 border-t border-slate-100 relative z-10">
            <h4 className="text-sm font-medium text-slate-900 mb-3">What happens next?</h4>
            <ul className="space-y-3">
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mr-2 flex-shrink-0" />
                <span className="text-xs text-slate-600">Your secure database tenant is provisioned immediately.</span>
              </li>
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mr-2 flex-shrink-0" />
                <span className="text-xs text-slate-600">Google Workspace SSO is unlocked for your domain.</span>
              </li>
              <li className="flex items-start">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mr-2 flex-shrink-0" />
                <span className="text-xs text-slate-600">You gain full access to the No-Code AppExchange.</span>
              </li>
            </ul>
          </div>
          
        </div>
      </div>
    </div>
  );
}

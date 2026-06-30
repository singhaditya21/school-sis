import React from 'react';
import { pool, runWithRlsBypass } from '@/lib/db';
import { Building2, Globe, User, CheckCircle2, ArrowRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import { hash } from 'bcryptjs';
import crypto from 'crypto';

export default function SchoolRegistrationPage() {

  // Server Action to handle the PLG registration and provision initial Admin user
  async function registerSchool(formData: FormData) {
    'use server';
    return runWithRlsBypass(() => registerSchoolWithBypass(formData));
  }

  async function registerSchoolWithBypass(formData: FormData) {
    'use server';
    const name = formData.get('schoolName') as string;
    const domain = formData.get('emailDomain') as string;
    const adminEmail = formData.get('adminEmail') as string;
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    
    if (!name || !domain || !adminEmail || !firstName || !lastName) return;

    // Generate a unique code from the school name
    const code = name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Provision the Tenant
      const tenantRes = await client.query(
        `INSERT INTO tenants (name, code, domain, is_active, created_at, updated_at) 
         VALUES ($1, $2, $3, true, NOW(), NOW()) RETURNING id`,
        [name, code, domain]
      );
      const tenantId = tenantRes.rows[0].id;

      // 2. Provision the Admin User account
      const randomPasswordHash = await hash(crypto.randomBytes(18).toString('base64url'), 12);
      await client.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'SCHOOL_ADMIN', true, NOW(), NOW())`,
        [tenantId, adminEmail, randomPasswordHash, firstName, lastName]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error("Failed to register tenant and admin user:", err);
      return;
    } finally {
      client.release();
    }

    // Redirect to the login page so they can sign in with Google SSO
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-slate-700">
                  First Name
                </label>
                <input
                  type="text"
                  name="firstName"
                  id="firstName"
                  required
                  placeholder="Jane"
                  className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-slate-300 rounded-lg py-3 bg-slate-50 border px-3"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-slate-700">
                  Last Name
                </label>
                <input
                  type="text"
                  name="lastName"
                  id="lastName"
                  required
                  placeholder="Doe"
                  className="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-slate-300 rounded-lg py-3 bg-slate-50 border px-3"
                />
              </div>
            </div>

            <div>
              <label htmlFor="adminEmail" className="block text-sm font-medium text-slate-700">
                Administrator Email Address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  name="adminEmail"
                  id="adminEmail"
                  required
                  placeholder="jane.doe@springfield.edu"
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

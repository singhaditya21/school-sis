import React from 'react';
import { pool } from '../../../../lib/db/client';
import { Search, Plus, Filter, MoreVertical } from 'lucide-react';

// Force dynamic rendering since we are fetching from the live database
export const dynamic = 'force-dynamic';

export default async function StudentDirectoryPage() {
  // In a real app, grab the tenantId from the NextAuth session.
  // Using a mock uuid for structural completeness here.
  const mockTenantId = '00000000-0000-0000-0000-000000000000';

  let students = [];
  try {
    const res = await pool.query(
      `SELECT 
        s.id, 
        s.first_name, 
        s.last_name, 
        s.admission_number, 
        s.status,
        g.name as grade_name,
        sec.name as section_name
      FROM students s
      LEFT JOIN grades g ON s.grade_id = g.id
      LEFT JOIN sections sec ON s.section_id = sec.id
      WHERE s.tenant_id = $1
      ORDER BY s.first_name ASC
      LIMIT 100`,
      [mockTenantId]
    );
    students = res.rows;
  } catch (error) {
    console.error("Failed to fetch students:", error);
    // Ignore error in UI for now, students array remains empty
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Directory</h1>
          <p className="text-slate-500 text-sm mt-1">Manage enrollments, view profiles, and update records.</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center transition-colors">
          <Plus className="w-5 h-5 mr-2" />
          Add Student
        </button>
      </div>

      {/* Table Toolbar */}
      <div className="bg-white p-4 rounded-t-xl border border-gray-200 flex justify-between items-center">
        <div className="relative w-96">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search students by name or admission number..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button className="flex items-center text-gray-600 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
          <Filter className="w-5 h-5 mr-2 text-gray-400" />
          Filters
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-gray-200 rounded-b-xl overflow-hidden -mt-6">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-600">
              <th className="px-6 py-4">Student Name</th>
              <th className="px-6 py-4">Admission No.</th>
              <th className="px-6 py-4">Class</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {students.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <UsersIcon className="w-12 h-12 text-gray-300 mb-3" />
                    <p className="text-lg font-medium text-gray-900">No students found</p>
                    <p className="text-sm mt-1">Get started by adding a new student to the directory.</p>
                  </div>
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{student.first_name} {student.last_name}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{student.admission_number}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {student.grade_name || 'N/A'} {student.section_name ? `- ${student.section_name}` : ''}
                  </td>
                  <td className="px-6 py-4">
                    <span className={\`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium \${
                      student.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 
                      student.status === 'ALUMNI' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                    }\`}>
                      {student.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Simple fallback icon if lucide import fails inside the empty state
function UsersIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

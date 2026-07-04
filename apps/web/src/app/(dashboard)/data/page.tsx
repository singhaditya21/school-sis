import React from 'react';
import { pool } from '@/lib/db';
import { Plus, Database, Columns, Filter, MoreHorizontal, Save } from 'lucide-react';
import { redirect } from "next/navigation";
import { getSession } from '@/lib/auth/session';
import { isTenantStaffRole } from '@/lib/auth/page-access';

export const dynamic = 'force-dynamic';

export default async function MetadataEnginePage() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect('/login');
  }

  if (!isTenantStaffRole(session.role) || !session.tenantId) {
    redirect('/unauthorized');
  }

  const tenantId = session.tenantId;

  // Fetch all custom objects for this school
  let objects = [];
  try {
    const objRes = await pool.query(
      `SELECT id, api_name as name, name as label
       FROM (
         SELECT DISTINCT ON (api_name) id, api_name, name, created_at, tenant_id
         FROM metadata_objects
         WHERE status = 'PUBLISHED'
           AND (
             tenant_id = $1
             OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
           )
         ORDER BY api_name, CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END, created_at DESC
       ) resolved_objects
       ORDER BY created_at ASC`,
      [tenantId]
    );
    objects = objRes.rows;
  } catch (error) {
    console.error("DB Error:", error);
  }

  // If we have objects, fetch the fields and records for the first one
  let activeObject = objects[0] || null;
  let fields = [];
  let records = [];

  if (activeObject) {
    // Fetch Columns (Fields)
    const fieldRes = await pool.query(
      `SELECT id, api_name as name, label, data_type as type
       FROM metadata_fields
       WHERE object_id = $1
         AND status = 'ACTIVE'
       ORDER BY created_at ASC`,
      [activeObject.id]
    );
    fields = fieldRes.rows;

    // Fetch Rows (Records) and their EAV Values
    const recordRes = await pool.query(
      `SELECT r.id as record_id, f.api_name as field_name, v.value_string, v.value_number, v.value_boolean, v.value_date
       FROM metadata_records r
       LEFT JOIN metadata_values v ON v.record_id = r.id
       LEFT JOIN metadata_fields f ON v.field_id = f.id
       WHERE r.object_id = $1
         AND r.tenant_id = $2
         AND (f.id IS NULL OR f.status = 'ACTIVE')`,
      [activeObject.id, tenantId]
    );

    // Pivot EAV into a flat JSON array
    const recordMap = new Map();
    recordRes.rows.forEach(row => {
      if (!recordMap.has(row.record_id)) recordMap.set(row.record_id, { id: row.record_id });
      const record = recordMap.get(row.record_id);
      if (row.field_name) {
        record[row.field_name] = row.value_string ?? row.value_number ?? row.value_boolean ?? row.value_date ?? '';
      }
    });
    records = Array.from(recordMap.values());
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header & Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-indigo-600" />
            No-Code Metadata Engine
          </h1>
          <p className="text-slate-500 text-sm mt-1">Build and manage infinite custom data structures.</p>
        </div>
        <div className="flex gap-3">
          <button className="text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
            Create Object
          </button>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center transition-colors shadow-sm">
            <Save className="w-4 h-4 mr-2" />
            Deploy API
          </button>
        </div>
      </div>

      {/* Airtable-like Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
        
        {/* Object Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto">
          {objects.length === 0 ? (
            <div className="px-6 py-3 text-sm text-slate-500 font-medium">No objects created yet.</div>
          ) : (
            objects.map((obj, i) => (
              <button 
                key={obj.id}
                className={`px-6 py-3 text-sm font-medium border-r border-slate-200 ${
                  i === 0 ? 'bg-white text-indigo-600 border-b-2 border-b-indigo-600' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {obj.label}
              </button>
            ))
          )}
          <button className="px-4 py-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-2 border-b border-slate-200 flex items-center gap-2 text-sm text-slate-600">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors">
            <Columns className="w-4 h-4" /> Fields
          </button>
          <div className="h-4 w-px bg-slate-300 mx-2"></div>
          <span className="text-slate-400">{records.length} records</span>
        </div>

        {/* Grid Area */}
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_0_#e2e8f0]">
              <tr>
                <th className="w-12 border-r border-slate-200 px-4 py-2">
                  <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                </th>
                {fields.map(f => (
                  <th key={f.id} className="border-r border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 tracking-wide uppercase group cursor-pointer hover:bg-slate-100">
                    <div className="flex items-center justify-between">
                      {f.label}
                      <MoreHorizontal className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-2 min-w-[200px]">
                  <button className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-xs font-semibold uppercase">
                    <Plus className="w-4 h-4" /> Add Field
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + 2} className="px-6 py-12 text-center text-slate-400">
                    No data in this object. Click "Add Record" to start.
                  </td>
                </tr>
              ) : (
                records.map((rec, idx) => (
                  <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50/50 group">
                    <td className="border-r border-slate-100 px-4 py-2 text-center text-slate-300 group-hover:text-slate-400">
                      {idx + 1}
                    </td>
                    {fields.map(f => (
                      <td key={f.id} className="border-r border-slate-100 p-0">
                        <input 
                          type="text" 
                          defaultValue={rec[f.name] || ''} 
                          className="w-full h-full min-h-[38px] px-4 py-2 bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          placeholder="Empty"
                        />
                      </td>
                    ))}
                    <td></td>
                  </tr>
                ))
              )}
              {/* Ghost Row for adding new records */}
              <tr className="border-b border-slate-100">
                <td className="border-r border-slate-100 px-4 py-2 text-center text-slate-300 font-bold">+</td>
                <td colSpan={fields.length + 1} className="px-4 py-2 text-slate-400 cursor-pointer hover:bg-slate-50 transition-colors">
                  Add new record...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

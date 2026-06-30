import React from 'react';
import { Store, Star, Download, Search, LayoutGrid, CheckCircle } from 'lucide-react';
import { pool } from '../../../lib/db/client';

export const dynamic = 'force-dynamic';

const FALLBACK_PLUGINS = [
  {
    id: 'plug_1',
    name: 'Canvas LMS Sync',
    developer: 'Instructure',
    description: 'Automatically sync grades, assignments, and rosters between Canvas and the core SIS.',
    price: '$199 / mo',
    rating: 4.8,
    installs: '2.1k',
    installed: false,
    color: 'bg-red-50 text-red-600',
  },
  {
    id: 'plug_2',
    name: 'Advanced Bus Routing',
    developer: 'GeoFleet Analytics',
    description: 'AI-powered bus routing and real-time GPS tracking integrated with the Parent App.',
    price: '$299 / mo',
    rating: 4.9,
    installs: '840',
    installed: true,
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    id: 'plug_3',
    name: 'Varsity Athletics Manager',
    developer: 'SportsTech',
    description: 'Manage rosters, medical clearance, and away-game logistics for varsity sports.',
    price: '$49 / mo',
    rating: 4.5,
    installs: '4.5k',
    installed: false,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    id: 'plug_4',
    name: 'Alumni Donor CRM',
    developer: 'Fundraiser Pro',
    description: 'Track alumni engagement and manage fundraising campaigns directly in the SIS.',
    price: '$149 / mo',
    rating: 4.7,
    installs: '1.2k',
    installed: false,
    color: 'bg-purple-50 text-purple-600',
  }
];

export default async function AppExchangePage() {
  let plugins = [];
  try {
    // 1. Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_plugins (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        developer VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        price VARCHAR(50) NOT NULL,
        rating NUMERIC(3,2) NOT NULL,
        installs VARCHAR(50) NOT NULL,
        installed BOOLEAN DEFAULT FALSE NOT NULL,
        color VARCHAR(100) NOT NULL
      )
    `);

    // 2. Populate table if empty
    const countRes = await pool.query('SELECT COUNT(*) FROM platform_plugins');
    if (parseInt(countRes.rows[0].count) === 0) {
      for (const p of FALLBACK_PLUGINS) {
        await pool.query(
          `INSERT INTO platform_plugins (id, name, developer, description, price, rating, installs, installed, color)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [p.id, p.name, p.developer, p.description, p.price, p.rating, p.installs, p.installed, p.color]
        );
      }
    }

    // 3. Query all platform plugins
    const res = await pool.query('SELECT * FROM platform_plugins ORDER BY name ASC');
    plugins = res.rows;
  } catch (err) {
    console.error("Database query failed for AppExchange plugins, using static fallbacks:", err);
    plugins = FALLBACK_PLUGINS;
  }

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-800 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <Store className="w-8 h-8 text-purple-300" />
            <h1 className="text-3xl font-bold">AppExchange</h1>
          </div>
          <p className="text-purple-200 text-lg max-w-2xl">
            Extend your core SIS with powerful 3rd-party applications. Install plugins with one click and pay via a unified monthly invoice.
          </p>
        </div>
        
        {/* Abstract Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-32 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 translate-y-1/2"></div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="relative w-96">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search apps by name, category, or developer..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm"
          />
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Categories
          </button>
          <button className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors">
            My Apps
          </button>
        </div>
      </div>

      {/* Plugin Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plugins.map(app => (
          <div key={app.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-6 flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${app.color}`}>
                <LayoutGrid className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-1 text-slate-500 text-sm font-medium">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                {app.rating}
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-slate-900">{app.name}</h3>
            <p className="text-xs text-slate-500 mb-3">by {app.developer}</p>
            
            <p className="text-sm text-slate-600 mb-6 flex-1 line-clamp-2">
              {app.description}
            </p>

            <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900">{app.price}</span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Download className="w-3 h-3" /> {app.installs} installs
                </span>
              </div>
              
              {app.installed ? (
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg cursor-default">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  Installed
                </button>
              ) : (
                <button className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
                  Install
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

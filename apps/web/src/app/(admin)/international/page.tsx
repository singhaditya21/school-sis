'use client';

export default function InternationalDashboard() {
    return (
        <div className="max-w-7xl mx-auto p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">International Operations & Visas</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-blue-200 bg-blue-50/50 shadow-sm cursor-pointer">
                    <span className="text-4xl mb-4 block">🛂</span>
                    <h3 className="text-xl font-semibold mb-2">Visa Compliance</h3>
                    <p className="text-gray-500 text-sm">Track Tier 4 / F-1 expirations, passport renewals, and statutory compliance status.</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <span className="text-4xl mb-4 block">🏠</span>
                    <h3 className="text-xl font-semibold mb-2">Host Families</h3>
                    <p className="text-gray-500 text-sm">Manage background-checked homestay placements and international boarding logistics.</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <span className="text-4xl mb-4 block">🌍</span>
                    <h3 className="text-xl font-semibold mb-2">University Placements</h3>
                    <p className="text-gray-500 text-sm">Analytics on Grade 12 Ivy League/Oxbridge admissions and alumni career tracking.</p>
                </div>
            </div>
        </div>
    );
}

'use client';

export default function UniversityDashboard() {
    return (
        <div className="max-w-7xl mx-auto p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Higher Education Administration</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <span className="text-4xl mb-4 block">🎓</span>
                    <h3 className="text-xl font-semibold mb-2">Degree Programs</h3>
                    <p className="text-gray-500 text-sm">Manage Bachelor, Master, and PhD program requirements and CBCS credits.</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <span className="text-4xl mb-4 block">👨‍🏫</span>
                    <h3 className="text-xl font-semibold mb-2">Faculty Workload</h3>
                    <p className="text-gray-500 text-sm">Track professor assignments, research hours, and semester scheduling.</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <span className="text-4xl mb-4 block">🏢</span>
                    <h3 className="text-xl font-semibold mb-2">Hostel & Allocations</h3>
                    <p className="text-gray-500 text-sm">Manage campus housing, dorm capacity, and student allocations.</p>
                </div>
            </div>
        </div>
    );
}

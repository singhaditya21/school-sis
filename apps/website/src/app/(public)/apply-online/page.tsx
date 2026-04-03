'use client';

import Link from 'next/link';

export default function PublicAdmissionsPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
            {/* Hero Section */}
            <div className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 opacity-90" />
                <div className="absolute inset-0">
                    <div className="absolute top-20 left-10 w-32 h-32 bg-white/10 rounded-full blur-xl" />
                    <div className="absolute bottom-10 right-20 w-48 h-48 bg-white/10 rounded-full blur-xl" />
                </div>

                <div className="relative max-w-6xl mx-auto px-6 py-24 text-center text-white">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full text-sm mb-6">
                        🎉 Admissions Open for 2026-27
                    </div>
                    <h1 className="text-5xl md:text-6xl font-bold mb-6">
                        Welcome to<br />
                        <span className="text-yellow-300">Greenwood International School</span>
                    </h1>
                    <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-10">
                        Nurturing minds, building futures. Join our community of 4,000+ students
                        and experience world-class education with Indian values.
                    </p>
                    <div className="flex justify-center gap-4">
                        <Link
                            href="/apply-online/apply"
                            className="px-8 py-4 bg-yellow-400 text-gray-900 rounded-xl font-semibold text-lg hover:bg-yellow-300 transition-colors shadow-lg"
                        >
                            Apply Now →
                        </Link>
                        <a
                            href="#info"
                            className="px-8 py-4 bg-white/20 border border-white/30 rounded-xl font-semibold text-lg hover:bg-white/30 transition-colors"
                        >
                            Learn More
                        </a>
                    </div>
                </div>
            </div>

            {/* Key Features */}
            <div id="info" className="max-w-6xl mx-auto px-6 py-20">
                <h2 className="text-3xl font-bold text-center mb-12">Why Choose Greenwood?</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                        { icon: '🎓', title: 'Excellence in Academics', desc: 'CBSE affiliated with 98% pass rate. Top 100 school in Karnataka.' },
                        { icon: '🏆', title: 'Holistic Development', desc: 'Sports, arts, music, and 50+ extracurricular clubs available.' },
                        { icon: '🌍', title: 'Global Exposure', desc: 'International exchange programs and MUN conferences.' },
                        { icon: '🔬', title: 'Modern Infrastructure', desc: 'Smart classrooms, labs, and 15-acre green campus.' },
                        { icon: '👨‍🏫', title: 'Expert Faculty', desc: '200+ qualified teachers with average 10+ years experience.' },
                        { icon: '🚌', title: 'Safe Transport', desc: 'GPS-tracked buses covering all major areas of Bangalore.' },
                    ].map((item, idx) => (
                        <div key={idx} className="p-6 bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
                            <div className="text-4xl mb-4">{item.icon}</div>
                            <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                            <p className="text-gray-600">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Fee Structure */}
            <div className="bg-gray-50 py-20">
                <div className="max-w-6xl mx-auto px-6">
                    <h2 className="text-3xl font-bold text-center mb-12">Fee Structure 2026-27</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {[
                            { grade: 'Nursery - KG', fee: '₹85,000', desc: 'Per annum' },
                            { grade: 'Class 1-5', fee: '₹95,000', desc: 'Per annum' },
                            { grade: 'Class 6-10', fee: '₹1,15,000', desc: 'Per annum' },
                            { grade: 'Class 11-12', fee: '₹1,35,000', desc: 'Per annum' },
                        ].map((item, idx) => (
                            <div key={idx} className="p-6 bg-white rounded-xl shadow text-center">
                                <div className="text-lg font-medium text-gray-600 mb-2">{item.grade}</div>
                                <div className="text-3xl font-bold text-blue-600 mb-1">{item.fee}</div>
                                <div className="text-sm text-gray-500">{item.desc}</div>
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-gray-500 mt-6 text-sm">
                        * Additional charges for transport, books, and uniform. Sibling discount available.
                    </p>
                </div>
            </div>

            {/* Admission Process */}
            <div className="max-w-6xl mx-auto px-6 py-20">
                <h2 className="text-3xl font-bold text-center mb-12">Admission Process</h2>
                <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                    {[
                        { step: 1, title: 'Online Application', desc: 'Fill the form & pay ₹500 registration fee' },
                        { step: 2, title: 'Document Submission', desc: 'Upload required documents' },
                        { step: 3, title: 'Interaction', desc: 'Student & parent interaction' },
                        { step: 4, title: 'Admission Confirmation', desc: 'Pay fees & collect kit' },
                    ].map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4">
                            <div className="flex flex-col items-center text-center">
                                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mb-2">
                                    {item.step}
                                </div>
                                <h4 className="font-semibold">{item.title}</h4>
                                <p className="text-sm text-gray-500 max-w-32">{item.desc}</p>
                            </div>
                            {idx < 3 && <div className="hidden md:block text-3xl text-gray-300">→</div>}
                        </div>
                    ))}
                </div>
                <div className="text-center mt-12">
                    <Link
                        href="/apply-online/apply"
                        className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors"
                    >
                        Start Your Application →
                    </Link>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-12">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <h3 className="text-xl font-semibold mb-4">Greenwood International School</h3>
                    <p className="text-gray-400 mb-4">123 Education Road, Whitefield, Bangalore - 560066</p>
                    <p className="text-gray-400">📞 080-12345678 | ✉️ admissions@greenwood.edu</p>
                </div>
            </footer>
        </div>
    );
}

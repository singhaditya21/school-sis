import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function SkillsWalletPage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <span className="text-amber-500">🏆</span> Digital Credentials Wallet
                    </h1>
                    <p className="text-gray-500 mt-1 text-sm md:text-base">Your verified skills, badges, and DigiLocker / APAAR integrated certificates.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button className="flex-1 md:flex-none justify-center bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm border border-gray-700">
                        <span className="bg-white text-gray-900 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none">Sync</span> DigiLocker
                    </button>
                    <button className="flex-1 md:flex-none justify-center bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                        Generate APAAR Share Link
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Official Documents / Verifiable Credentials */}
                <div className="md:col-span-2 space-y-4">
                    <h2 className="text-lg font-bold text-gray-900 mb-2">Verified Transcripts & Degrees</h2>
                    
                    {[
                        { title: 'B.Tech Year 1 Consolidated Transcript', issuer: 'ScholarMind University', date: 'Jul 2025', id: 'SMU-2025-10492', icon: '🎓', verified: true },
                        { title: 'Secondary School Certificate (Grade 12)', issuer: 'CBSE Board', date: 'May 2023', id: 'DL-CBSE-99210', icon: '📜', verified: true, source: 'DigiLocker' },
                    ].map((doc, i) => (
                        <Card key={i} className="border-gray-200 shadow-sm hover:border-amber-300 transition-colors cursor-pointer group">
                            <CardContent className="p-4 md:p-5 flex items-start gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0 group-hover:scale-105 transition-transform">
                                    {doc.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <h3 className="font-semibold text-gray-900 text-base">{doc.title}</h3>
                                        {doc.verified && (
                                            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border border-emerald-100">
                                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> Cryptographically Verified
                                            </span>
                                        )}
                                        {doc.source && (
                                            <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border border-blue-100">
                                                Via {doc.source}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm font-medium text-gray-600">Issued by {doc.issuer}</p>
                                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                        <span>{doc.date}</span>
                                        <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">ID: {doc.id}</span>
                                    </div>
                                </div>
                                <div className="hidden md:flex flex-col gap-2 shrink-0 border-l border-gray-100 pl-4 ml-2">
                                    <button className="text-xs font-semibold text-amber-600 hover:text-amber-700 text-left">View PDF →</button>
                                    <button className="text-xs font-semibold text-gray-500 hover:text-gray-700 text-left">Verify Hash</button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    
                    <button className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 text-center bg-gray-50 hover:bg-gray-100 transition-colors font-medium text-gray-600 text-sm">
                        + Import External Credential File (.jsonld / .pkpass)
                    </button>
                </div>

                {/* Skills and Micro-credentials */}
                <div className="space-y-4">
                     <h2 className="text-lg font-bold text-gray-900 mb-2">Micro-Credentials</h2>
                     
                     <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border-0 shadow-md">
                         <CardHeader className="pb-2 flex flex-row items-center justify-between border-b border-gray-700/50">
                             <CardTitle className="text-sm text-gray-300 uppercase tracking-widest font-semibold flex items-center gap-2">
                                 <span className="text-amber-400">⚡</span> Total Skill Points
                             </CardTitle>
                         </CardHeader>
                         <CardContent className="pt-4 pb-5">
                             <div className="text-4xl font-black mb-1">1,450 <span className="text-lg text-gray-400 font-medium">XP</span></div>
                             <p className="text-xs text-gray-400">Class Rank: Top 15%</p>
                         </CardContent>
                     </Card>

                     <div className="grid grid-cols-2 gap-3">
                         {[
                             { badge: 'Python Expert', src: '🐍', date: 'Oct 2025' },
                             { badge: 'Data Structs I', src: '🌳', date: 'Sep 2025' },
                             { badge: 'Hackathon 1st', src: '🏆', date: 'Aug 2025' },
                             { badge: '100% Attendance', src: '🛡️', date: 'Term 1' },
                         ].map((s, i) => (
                             <Card key={i} className="bg-gray-50 border-gray-200 text-center hover:shadow-sm transition-shadow">
                                 <CardContent className="p-4 flex flex-col items-center justify-center">
                                     <div className="text-3xl mb-2 drop-shadow-sm">{s.src}</div>
                                     <h4 className="font-semibold text-gray-900 text-xs leading-tight mb-1">{s.badge}</h4>
                                     <span className="text-[10px] text-gray-500">{s.date}</span>
                                 </CardContent>
                             </Card>
                         ))}
                     </div>
                </div>
            </div>
        </div>
    );
}

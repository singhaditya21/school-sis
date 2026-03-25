import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function ProctoredExamsPage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <span className="text-indigo-600">📷</span> Proctored Online Exams
                    </h1>
                    <p className="text-gray-500 mt-1">Configure remote assessments with webcam monitoring, tab-lock, and AI cheat detection.</p>
                </div>
                <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                    + Create New Exam
                </button>
            </div>

            <Card className="border-indigo-100 shadow-sm overflow-hidden">
                <CardHeader className="bg-indigo-50/50 border-b border-indigo-100">
                    <CardTitle className="text-lg text-indigo-900">Configure Security Protocols for 'CS301 Midterm'</CardTitle>
                    <CardDescription className="text-indigo-700/70">Scheduled for Thursday, 14:00 - 16:00 (120 minutes)</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                        {/* Hardware Requirements */}
                        <div className="p-6 space-y-6">
                            <h3 className="font-semibold text-gray-900 uppercase tracking-widest text-xs">Hardware Constraints</h3>
                            
                            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <input type="checkbox" defaultChecked className="mt-1 w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                                <div>
                                    <h4 className="font-medium text-sm text-gray-900">Enforce Webcam Recording</h4>
                                    <p className="text-xs text-gray-500 mt-1">Students must keep an active video stream open for the duration of the exam. Feeds are saved for 30 days.</p>
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <input type="checkbox" defaultChecked className="mt-1 w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                                <div>
                                    <h4 className="font-medium text-sm text-gray-900">Enforce Microphone Recording</h4>
                                    <p className="text-xs text-gray-500 mt-1">Audio feed active. AI will flag background voices or whispering.</p>
                                </div>
                            </div>
                        </div>

                        {/* Browser integrity */}
                        <div className="p-6 space-y-6">
                            <h3 className="font-semibold text-gray-900 uppercase tracking-widest text-xs">Browser & Integrity</h3>
                            
                            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <input type="checkbox" defaultChecked className="mt-1 w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                                <div>
                                    <h4 className="font-medium text-sm text-gray-900">Force Fullscreen (Tab Lock)</h4>
                                    <p className="text-xs text-gray-500 mt-1">Exam terminates if student switches tabs or exits fullscreen more than 2 times.</p>
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <input type="checkbox" defaultChecked className="mt-1 w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                                <div>
                                    <h4 className="font-medium text-sm text-gray-900">AcademAgent Cheat Detection</h4>
                                    <p className="text-xs text-gray-500 mt-1">AI vision models run locally to detect multiple faces, looking away, or phone usage. Flags violations in real-time.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3">
                        <button className="text-gray-600 hover:text-gray-900 bg-white border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            Preview Exam Environment
                        </button>
                        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                            Save Security Protocol & Publish Exam Link
                        </button>
                    </div>
                </CardContent>
            </Card>

            <h2 className="text-lg font-bold text-gray-900 mt-10 mb-4">Upcoming Proctored Sessions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {[
                     { name: 'CS301 Midterm', date: 'Thurs, Oct 12', time: '14:00', students: 142, flags: 'Security Active' },
                     { name: 'CS101 Intro Quiz', date: 'Fri, Oct 13', time: '09:00', students: 250, flags: 'Basic Tab Lock Only' },
                 ].map((exam, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer">
                        <div>
                            <h3 className="font-semibold text-gray-900">{exam.name}</h3>
                            <p className="text-xs text-gray-500 mt-1">{exam.date} @ {exam.time} • {exam.students} candidates</p>
                        </div>
                        <div className="text-right">
                            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded inline-block mb-2">{exam.flags}</span>
                            <div className="text-xs text-gray-400">Settings →</div>
                        </div>
                    </div>
                 ))}
            </div>
        </div>
    );
}

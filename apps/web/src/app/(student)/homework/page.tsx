import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function StudentHomeworkPage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <span className="text-violet-600">📝</span> Assignments & Submissions
                    </h1>
                    <p className="text-gray-500 mt-1 text-sm md:text-base">Upload coursework, track deadlines, and view instructor feedback.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <select className="flex-1 md:flex-none bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/20">
                        <option>Current Term</option>
                        <option>Past Terms</option>
                    </select>
                </div>
            </div>

            {/* Mobile-optimized KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <Card className="border-rose-100 bg-rose-50/50">
                    <CardHeader className="p-3 md:pb-2">
                        <CardTitle className="text-[10px] md:text-xs font-semibold text-rose-600 uppercase tracking-wider">Due This Week</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-2xl md:text-3xl font-bold text-gray-900">2</div>
                    </CardContent>
                </Card>
                <Card className="border-amber-100 bg-amber-50/50">
                    <CardHeader className="p-3 md:pb-2">
                        <CardTitle className="text-[10px] md:text-xs font-semibold text-amber-600 uppercase tracking-wider">Pending Grading</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-2xl md:text-3xl font-bold text-gray-900">1</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="p-3 md:pb-2">
                        <CardTitle className="text-[10px] md:text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-2xl md:text-3xl font-bold text-gray-900">14</div>
                    </CardContent>
                </Card>
                <Card className="hidden lg:block border-emerald-100 bg-emerald-50/50">
                    <CardHeader className="p-3 md:pb-2">
                        <CardTitle className="text-[10px] md:text-xs font-semibold text-emerald-600 uppercase tracking-wider">Average Score</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        <div className="text-2xl md:text-3xl font-bold text-gray-900">88%</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
                <div className="col-span-1 lg:col-span-2 space-y-4">
                    <h2 className="text-lg font-bold text-gray-900 mb-2">Active Assignments</h2>

                    {/* Pending assignment card */}
                    <Card className="border-rose-200 border-l-4 border-l-rose-500 shadow-sm transition-all hover:shadow-md">
                        <CardContent className="p-4 md:p-5">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-semibold text-gray-900 text-lg">Lab 4: Binary Search Trees</h3>
                                    <p className="text-sm font-medium text-violet-600 mt-1">CS301: Data Structures</p>
                                </div>
                                <span className="text-[10px] md:text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded uppercase tracking-wide">Due in 2 Days</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-3 line-clamp-2 md:line-clamp-none">
                                Implement a balanced BST handling insertions, deletions, and level-order traversal. Submit your `.py` or `.java` files along with a screenshot of the test cases passing.
                            </p>
                            
                            {/* Drag and drop zone */}
                            <div className="mt-5 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex flex-col items-center justify-center">
                                <div className="text-3xl mb-2">📤</div>
                                <p className="text-sm font-medium text-gray-700">Tap to upload or drag files here</p>
                                <p className="text-xs text-gray-500 mt-1">.pdf, .zip, .java, .py (Max 50MB)</p>
                            </div>

                            <div className="mt-4 flex justify-end">
                                <button className="w-full md:w-auto bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
                                    Turn In Assignment
                                </button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pending grading card */}
                    <Card className="border-amber-200 border-l-4 border-l-amber-500 shadow-sm opacity-90">
                        <CardContent className="p-4 md:p-5">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-semibold text-gray-900 text-lg">Essay: The French Revolution</h3>
                                    <p className="text-sm font-medium text-violet-600 mt-1">HIS201: World History</p>
                                </div>
                                <span className="text-[10px] md:text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded uppercase tracking-wide">Pending Review</span>
                            </div>
                            
                            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold shrink-0">PDF</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">aarav_sharma_revolution_essay_final.pdf</p>
                                    <p className="text-xs text-gray-500">Submitted Oct 10, 14:05 PM</p>
                                </div>
                                <button className="text-xs text-blue-600 font-medium whitespace-nowrap">Unsubmit</button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-gray-900 mb-2">Recently Graded</h2>
                    
                    <Card className="shadow-sm">
                        <CardContent className="p-0">
                            <div className="divide-y divide-gray-100">
                                {[
                                    { title: 'Quiz 2: Linked Lists', course: 'CS301', score: '9/10', color: 'emerald', feedback: 'Great edge case handling in deletion.' },
                                    { title: 'Lab Model 3', course: 'PHY101', score: '18/25', color: 'amber', feedback: 'See comments on PDF regarding unit conversions.' },
                                    { title: 'Poetry Analysis', course: 'ENG104', score: 'A-', color: 'emerald', feedback: 'Strong thesis statement.' },
                                ].map((g, i) => (
                                    <div key={i} className="p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex justify-between items-start mb-1">
                                            <div>
                                                <h4 className="font-semibold text-gray-900 text-sm">{g.title}</h4>
                                                <p className="text-xs text-violet-600 font-medium">{g.course}</p>
                                            </div>
                                            <span className={`font-bold text-${g.color}-600 bg-${g.color}-50 px-2 py-0.5 rounded text-sm`}>{g.score}</span>
                                        </div>
                                        <p className="text-xs text-gray-600 mt-2 bg-gray-50 p-2 rounded italic border border-gray-100 border-l-2 border-l-gray-300">"{g.feedback}"</p>
                                    </div>
                                ))}
                            </div>
                            <div className="p-3 text-center border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
                                <button className="text-xs font-semibold text-violet-600">View All Grades →</button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

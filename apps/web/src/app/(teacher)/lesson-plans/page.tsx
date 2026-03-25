import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function LessonPlansPage() {
    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <span className="text-blue-600">🧠</span> AI Lesson Planning Engine
                    </h1>
                    <p className="text-gray-500 mt-1">Leverage AcademAgent to dynamically generate day-by-day syllabus breakdowns, quizzes, and reading materials.</p>
                </div>
                <div className="flex gap-3">
                    <select className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option>CS301: Data Structures</option>
                        <option>CS302: Operating Systems</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* AI Assistant Chat side */}
                <Card className="col-span-1 border-blue-100 bg-blue-50/30 flex flex-col h-[600px]">
                    <CardHeader className="border-b border-blue-100 bg-white/50 backdrop-blur-sm pb-4">
                        <CardTitle className="text-base text-blue-900 flex items-center gap-2">
                            AcademAgent Copilot
                        </CardTitle>
                        <CardDescription className="text-blue-700/70">Powered by llama.cpp (Qwen 7B)</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                        <div className="bg-white p-3 rounded-xl border border-blue-100 text-sm shadow-sm text-gray-700">
                            Hello! I notice you are planning the syllabus for **CS301: Data Structures**. We have 14 weeks of instruction ahead. Would you like me to generate a 40-lecture breakdown based on the AICTE model curriculum?
                        </div>
                        <div className="bg-blue-600 text-white p-3 rounded-xl rounded-tr-sm text-sm shadow-sm self-end ml-12">
                            Yes, but dedicate Week 12 entirely to Graph Algorithms and Dijkstra's.
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-blue-100 text-sm shadow-sm text-gray-700">
                            <strong>Drafting Plan...</strong><br/><br/>
                            I've updated the module block. I also generated 3 mini-assignment prompts for the Graph theory week based on real-world routing problems. You can review the updated timetable on the right.
                        </div>
                    </CardContent>
                    <div className="p-4 bg-white border-t border-blue-100">
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="E.g., Suggest a lab assignment for Trees..." 
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300" 
                            />
                            <button className="absolute right-2 top-2 text-blue-600 hover:text-blue-800">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            </button>
                        </div>
                    </div>
                </Card>

                {/* Generated Syllabus View */}
                <Card className="col-span-1 lg:col-span-2 flex flex-col h-[600px]">
                    <CardHeader className="border-b border-gray-100 pb-4 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Generated Semester Plan</CardTitle>
                            <CardDescription className="text-gray-500">CS301: Fall 2026</CardDescription>
                        </div>
                        <button className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors border border-blue-200">
                           Export to Moodle (LTI)
                        </button>
                    </CardHeader>
                    <CardContent className="p-0 overflow-y-auto">
                        <div className="divide-y divide-gray-100">
                            {[
                                { week: 'Week 1-2', topic: 'Algorithm Analysis & Big-O Notation', lectures: 6, status: 'Completed', ai: false },
                                { week: 'Week 3-4', topic: 'Linear Structures: Stacks, Queues, Linked Lists', lectures: 6, status: 'Completed', ai: false },
                                { week: 'Week 5-7', topic: 'Trees: Binary, AVL, Red-Black', lectures: 9, status: 'In Progress', ai: false },
                                { week: 'Week 8', topic: 'Midterm Examinations', lectures: 0, status: 'Upcoming', ai: false },
                                { week: 'Week 9-11', topic: 'Hashing & Priority Queues', lectures: 8, status: 'Upcoming', ai: false },
                                { week: 'Week 12-13', topic: 'Graph Algorithms (Dijkstra, MST, BFS/DFS)', lectures: 6, status: 'AI Modified', ai: true },
                                { week: 'Week 14', topic: 'Advanced Topics & Review', lectures: 3, status: 'Upcoming', ai: false },
                            ].map((w, i) => (
                                <div key={i} className={`p-4 hover:bg-gray-50 transition-colors ${w.ai ? 'bg-blue-50/30' : ''}`}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-semibold text-gray-900">{w.topic}</h4>
                                                {w.ai && <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">AI Edit</span>}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1 font-medium">{w.week} • {w.lectures} Lectures</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button className="text-xs text-gray-500 border border-gray-200 bg-white px-2 py-1 rounded hover:bg-gray-50">View Materials</button>
                                        </div>
                                    </div>
                                    {w.ai && (
                                        <div className="mt-3 pl-3 border-l-2 border-blue-400">
                                            <p className="text-xs text-gray-600"><span className="font-medium text-gray-900">Lab Assignment:</span> "Build a navigation routing system for a delivery fleet using Dijkstra's algorithm over a city graph matrix."</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}

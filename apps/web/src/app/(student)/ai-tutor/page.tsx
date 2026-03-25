import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function AITutorPage() {
    return (
        <div className="h-[calc(100vh-220px)] md:h-[calc(100vh-140px)] flex flex-col max-w-5xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <span className="text-violet-600">🤖</span> 24/7 AI Tutor
                    </h1>
                    <p className="text-gray-500 mt-1 text-sm md:text-base hidden md:block">Personalized learning assistant powered by AcademAgent. Tuned directly to your current syllabus.</p>
                </div>
                <div className="flex gap-2 w-max">
                    <select className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/20">
                        <option>CS301: Data Structures</option>
                        <option>HIS201: World History</option>
                        <option>General Support</option>
                    </select>
                </div>
            </div>

            <Card className="flex-1 flex flex-col mt-4 overflow-hidden border-violet-100 shadow-sm">
                <CardHeader className="bg-violet-50/50 border-b border-violet-100 py-3 shrink-0 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                                A
                            </div>
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full"></div>
                        </div>
                        <div>
                            <CardTitle className="text-base text-violet-900">AcademAgent</CardTitle>
                            <CardDescription className="text-xs text-violet-700/80 font-medium">Synced with Prof. Desai's CS301 Syllabus</CardDescription>
                        </div>
                    </div>
                    <div className="hidden md:flex gap-2">
                         <button className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded transition-colors border border-gray-200 bg-white">Clear Context</button>
                    </div>
                </CardHeader>
                
                {/* Chat History Area */}
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50 relative">
                    {/* Timestamp */}
                    <div className="flex justify-center">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-200/50 px-2 py-1 rounded">Today, 2:15 PM</span>
                    </div>

                    {/* Agent Message */}
                    <div className="flex items-end gap-2 max-w-[90%] md:max-w-[75%]">
                        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs shrink-0">A</div>
                        <div className="bg-white p-3 md:p-4 rounded-2xl rounded-bl-sm border border-gray-200 text-sm shadow-sm text-gray-700">
                            Hi Aarav! I see you have **Lab 4: Binary Search Trees** due in 2 days. I've reviewed your recent Quiz 2 results and noticed you struggled slightly with edge cases in node deletion. Do you want to review the three deletion cases (leaf, one child, two children) before you start coding?
                        </div>
                    </div>

                    {/* User Message */}
                    <div className="flex items-end gap-2 max-w-[90%] md:max-w-[75%] ml-auto justify-end">
                        <div className="bg-violet-600 text-white p-3 md:p-4 rounded-2xl rounded-br-sm text-sm shadow-sm">
                            Yes please. Specifically, I'm confused about the case where the node to delete has two children. Do I replace it with the inorder successor or predecessor?
                        </div>
                    </div>

                    {/* Agent Message (Rich content) */}
                    <div className="flex items-start gap-2 max-w-[90%] md:max-w-[85%]">
                        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs shrink-0 mt-1">A</div>
                        <div className="bg-white p-3 md:p-4 rounded-2xl rounded-tl-sm border border-gray-200 text-sm shadow-sm text-gray-700 w-full overflow-hidden">
                            Great question! You can actually use **either** the inorder successor (the smallest node in the right subtree) or the inorder predecessor (the largest node in the left subtree). Prof. Desai's lecture notes from Week 5 use the **inorder successor** approach.
                            
                            <div className="my-3 border-l-4 border-violet-400 pl-3">
                                <strong>The Steps:</strong>
                                <ol className="list-decimal ml-4 mt-2 space-y-1 text-xs md:text-sm">
                                    <li>Find the node `N` to delete.</li>
                                    <li>Find `N`'s inorder successor (go to `N.right`, then as far `left` as possible).</li>
                                    <li>Copy the successor's data value into `N`.</li>
                                    <li>Recursively delete the successor (which is guaranteed to have at most one child, so it falls into the easier deletion cases!).</li>
                                </ol>
                            </div>
                            
                            Here is a structural visual. Does this clarify the logic? Let me know if you want me to generate a practice problem.
                        </div>
                    </div>
                </CardContent>

                {/* Input Area */}
                <div className="p-3 md:p-4 bg-white border-t border-violet-100 shrink-0">
                    <div className="flex gap-2">
                        <button className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors shrink-0 cursor-pointer">
                            📎
                        </button>
                        <div className="relative flex-1">
                            <textarea 
                                placeholder="Ask AcademAgent a question..." 
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 resize-none h-12 flex items-center" 
                                rows={1}
                            />
                            <button className="absolute right-2 top-[6px] w-9 h-9 bg-violet-600 text-white flex items-center justify-center rounded-lg hover:bg-violet-700 transition-colors shadow-sm">
                                ↑
                            </button>
                        </div>
                    </div>
                    <div className="flex justify-center mt-2">
                        <span className="text-[10px] text-gray-400 font-medium">AI can make mistakes. Verify critical syllabus or grading information with your instructor.</span>
                    </div>
                </div>
            </Card>
        </div>
    );
}

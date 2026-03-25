'use client';

import { useState, useEffect } from 'react';
import { getTenantId } from '@/lib/actions/scaffolding-bridge';

export default function ChatPage() {
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState<any[]>([]);
    const [agent, setAgent] = useState('synthesis');
    const [loading, setLoading] = useState(false);
    const [tenantId, setTenantId] = useState('');

    useEffect(() => { getTenantId().then(setTenantId); }, []);

    const handleSend = async () => {
        if (!query.trim()) return;

        const newMessages = [...messages, { role: 'user', content: query }];
        setMessages(newMessages);
        setQuery('');
        setLoading(true);

        try {
            // Forwarding directly to the AI Agent Gateway API
            const response = await fetch(`http://localhost:8000/api/v1/agents/${agent}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: newMessages[newMessages.length - 1].content, tenant_id: tenantId })
            });
            const data = await response.json();
            
            if (response.ok) {
                setMessages([...newMessages, { role: 'agent', content: data.answer, meta: { tokens: data.tokens_used, latency: data.latency_ms } }]);
            } else {
                setMessages([...newMessages, { role: 'agent', content: 'Agent Error: ' + (data.detail || 'Unknown error') }]);
            }
        } catch (error: any) {
            setMessages([...newMessages, { role: 'agent', content: 'Connection Error: ' + error.message }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] max-w-5xl mx-auto p-4">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold text-gray-900">ScholarMind Intelligence</h1>
                <select 
                    value={agent} 
                    onChange={(e) => setAgent(e.target.value)}
                    className="border border-gray-300 rounded p-2 text-sm bg-white"
                >
                    <option value="synthesis">Synthesis Agent (Headmaster)</option>
                    <option value="fee">Fee Agent</option>
                    <option value="attend">Attendance Agent</option>
                    <option value="academ">Academic Agent</option>
                    <option value="risk">Risk Agent</option>
                </select>
            </div>

            <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-4 space-y-6">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <span className="text-4xl mb-2">🎓</span>
                        <p>Ask a question to your intelligent agents.</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] p-4 rounded-xl ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                {msg.meta && (
                                    <div className="mt-2 text-xs text-gray-500 flex gap-4">
                                        <span>⏱️ {msg.meta.latency}ms</span>
                                        <span>🎫 {msg.meta.tokens} tokens</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 p-4 rounded-xl text-gray-500 animate-pulse">
                            Thinking deeply...
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask about overdue fees, attendance drops, or cross-reference student risk..."
                    className="flex-1 border border-gray-300 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                />
                <button
                    onClick={handleSend}
                    disabled={loading || !query.trim()}
                    className="bg-blue-600 text-white px-8 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    Send
                </button>
            </div>
        </div>
    );
}

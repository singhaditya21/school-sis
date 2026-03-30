'use client';

import { useState, useEffect } from 'react';

export default function ApprovalsPage() {
    const [approvals, setApprovals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Hardcoded tenant for demonstration
    const tenantId = '11111111-1111-1111-1111-111111111111';

    const fetchApprovals = async () => {
        try {
            const agentBaseUrl = process.env.NEXT_PUBLIC_AGENT_URL || 'http://localhost:8083';
            const res = await fetch(`${agentBaseUrl}/api/v1/approvals/${tenantId}`);
            if (!res.ok) throw new Error('Failed to fetch approvals');
            const data = await res.json();
            setApprovals(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApprovals();
    }, []);

    const handleReview = async (id: string, action: 'APPROVED' | 'REJECTED') => {
        try {
            const agentBaseUrl = process.env.NEXT_PUBLIC_AGENT_URL || 'http://localhost:8083';
            const res = await fetch(`${agentBaseUrl}/api/v1/approvals/${tenantId}/${id}/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, user_id: '22222222-2222-2222-2222-222222222222' })
            });
            if (res.ok) {
                // Remove from list or refetch
                setApprovals(approvals.filter(a => a.id !== id));
            } else {
                const data = await res.json();
                alert('Error: ' + data.detail);
            }
        } catch (err: any) {
            alert('Failed to process action: ' + err.message);
        }
    };

    if (loading) return <div className="p-8">Loading approval queue...</div>;
    if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

    return (
        <div className="max-w-6xl mx-auto p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Agent Action Approvals</h1>
            
            {approvals.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-xl border border-gray-200">
                    <span className="text-4xl">🎉</span>
                    <h2 className="mt-4 text-lg font-medium">No actions pending</h2>
                    <p className="text-gray-500">All AI agent proposals have been reviewed.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {approvals.map((approval) => (
                        <div key={approval.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-6">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className={`px-2 py-1 text-xs font-bold rounded ${
                                        approval.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                                        approval.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                                        'bg-blue-100 text-blue-700'
                                    }`}>
                                        {approval.priority}
                                    </span>
                                    <span className="text-sm font-medium text-gray-500">
                                        Proposed by {approval.agent_name}
                                    </span>
                                </div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">{approval.title}</h3>
                                <p className="text-gray-600 mb-4">{approval.description}</p>
                                
                                <div className="bg-gray-50 rounded p-3 text-sm font-mono text-gray-700 overflow-x-auto">
                                    {JSON.stringify(approval.proposed_action)}
                                </div>
                            </div>
                            
                            <div className="flex md:flex-col gap-3 justify-center md:border-l border-gray-100 md:pl-6">
                                <button 
                                    onClick={() => handleReview(approval.id, 'APPROVED')}
                                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex-1 md:flex-none"
                                >
                                    Approve Action
                                </button>
                                <button 
                                    onClick={() => handleReview(approval.id, 'REJECTED')}
                                    className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex-1 md:flex-none"
                                >
                                    Reject / Dismiss
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

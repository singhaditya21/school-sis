'use client';

import React, { useState, useEffect, useCallback } from 'react';

/**
 * Audit Trail Viewer — Admin compliance dashboard.
 *
 * Displays all system activity logs with filtering by action type,
 * user, date range, and entity. Highlights suspicious activity
 * (bulk deletes, PII exports, off-hours access).
 */

interface AuditLogEntry {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    userId: string;
    userName: string;
    role: string;
    ipAddress: string;
    createdAt: string;
    metadata: Record<string, unknown>;
}

const ACTION_BADGES: Record<string, { label: string; color: string }> = {
    CREATE: { label: 'Created', color: '#22c55e' },
    UPDATE: { label: 'Updated', color: '#3b82f6' },
    DELETE: { label: 'Deleted', color: '#ef4444' },
    LOGIN: { label: 'Login', color: '#8b5cf6' },
    LOGOUT: { label: 'Logout', color: '#6b7280' },
    EXPORT: { label: 'Export', color: '#f59e0b' },
    EXPORT_PII: { label: 'PII Export', color: '#dc2626' },
    BULK_DELETE: { label: 'Bulk Delete', color: '#dc2626' },
    ROLE_CHANGE: { label: 'Role Change', color: '#ea580c' },
    PASSWORD_RESET: { label: 'Password Reset', color: '#d946ef' },
};

const SUSPICIOUS_ACTIONS = new Set(['DELETE', 'BULK_DELETE', 'EXPORT_PII', 'ROLE_CHANGE']);

export default function AuditTrailPage() {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({
        action: '',
        entityType: '',
        search: '',
        days: 7,
    });

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filter.action) params.set('action', filter.action);
            if (filter.entityType) params.set('entityType', filter.entityType);
            if (filter.days) params.set('days', String(filter.days));
            const resp = await fetch(`/api/audit-trail?${params}`);
            if (resp.ok) {
                const data = await resp.json();
                setLogs(data.logs || []);
            }
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const filteredLogs = logs.filter((log) => {
        if (filter.search) {
            const s = filter.search.toLowerCase();
            return (
                log.userName?.toLowerCase().includes(s) ||
                log.entityType?.toLowerCase().includes(s) ||
                log.action?.toLowerCase().includes(s) ||
                log.ipAddress?.includes(s)
            );
        }
        return true;
    });

    const suspiciousCount = logs.filter((l) => SUSPICIOUS_ACTIONS.has(l.action)).length;

    return (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>🛡️ Audit Trail</h1>
                    <p style={{ color: '#6b7280', margin: '0.25rem 0 0' }}>
                        System activity log • {logs.length} events in last {filter.days} days
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={fetchLogs}
                        style={{
                            padding: '0.5rem 1rem',
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: 500,
                        }}
                    >
                        ↻ Refresh
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <StatCard label="Total Events" value={logs.length} color="#3b82f6" />
                <StatCard label="Unique Users" value={new Set(logs.map((l) => l.userId)).size} color="#8b5cf6" />
                <StatCard
                    label="Suspicious"
                    value={suspiciousCount}
                    color={suspiciousCount > 0 ? '#ef4444' : '#22c55e'}
                />
                <StatCard
                    label="Data Exports"
                    value={logs.filter((l) => l.action?.includes('EXPORT')).length}
                    color="#f59e0b"
                />
            </div>

            {/* Filters */}
            <div
                style={{
                    display: 'flex',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                    flexWrap: 'wrap',
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '0.75rem',
                    border: '1px solid #e2e8f0',
                }}
            >
                <input
                    type="text"
                    placeholder="Search users, entities, IPs..."
                    value={filter.search}
                    onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                    style={{
                        flex: 1,
                        minWidth: '200px',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                    }}
                />
                <select
                    value={filter.action}
                    onChange={(e) => setFilter({ ...filter, action: e.target.value })}
                    style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}
                >
                    <option value="">All Actions</option>
                    {Object.keys(ACTION_BADGES).map((a) => (
                        <option key={a} value={a}>{ACTION_BADGES[a].label}</option>
                    ))}
                </select>
                <select
                    value={filter.days}
                    onChange={(e) => setFilter({ ...filter, days: Number(e.target.value) })}
                    style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}
                >
                    <option value={1}>Last 24h</option>
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                </select>
            </div>

            {/* Suspicious Alert */}
            {suspiciousCount > 0 && (
                <div
                    style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '0.75rem',
                        padding: '0.75rem 1rem',
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#991b1b',
                    }}
                >
                    <span>⚠️</span>
                    <strong>{suspiciousCount} suspicious event{suspiciousCount > 1 ? 's' : ''}</strong>
                    &nbsp;detected — includes bulk deletes, PII exports, or role changes.
                </div>
            )}

            {/* Log Table */}
            <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={thStyle}>Timestamp</th>
                            <th style={thStyle}>Action</th>
                            <th style={thStyle}>User</th>
                            <th style={thStyle}>Role</th>
                            <th style={thStyle}>Entity</th>
                            <th style={thStyle}>IP Address</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                                    Loading audit logs...
                                </td>
                            </tr>
                        ) : filteredLogs.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                                    No audit events found for the selected filters.
                                </td>
                            </tr>
                        ) : (
                            filteredLogs.map((log) => {
                                const isSuspicious = SUSPICIOUS_ACTIONS.has(log.action);
                                const badge = ACTION_BADGES[log.action] || { label: log.action, color: '#6b7280' };
                                return (
                                    <tr
                                        key={log.id}
                                        style={{
                                            borderBottom: '1px solid #f1f5f9',
                                            background: isSuspicious ? '#fef2f2' : 'transparent',
                                        }}
                                    >
                                        <td style={tdStyle}>
                                            {new Date(log.createdAt).toLocaleString('en-IN', {
                                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                            })}
                                        </td>
                                        <td style={tdStyle}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: '999px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: badge.color + '18',
                                                    color: badge.color,
                                                    border: `1px solid ${badge.color}40`,
                                                }}
                                            >
                                                {badge.label}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>{log.userName || log.userId?.slice(0, 8)}</td>
                                        <td style={tdStyle}>
                                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{log.role}</span>
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                                {log.entityType}
                                                {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ''}
                                            </span>
                                        </td>
                                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                            {log.ipAddress || '—'}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div
            style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '0.75rem',
                padding: '1rem 1.25rem',
                borderLeft: `4px solid ${color}`,
            }}
        >
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
        </div>
    );
}

const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.75rem 1rem',
    fontWeight: 600,
    fontSize: '0.78rem',
    textTransform: 'uppercase',
    color: '#475569',
    letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
    padding: '0.6rem 1rem',
    verticalAlign: 'middle',
};

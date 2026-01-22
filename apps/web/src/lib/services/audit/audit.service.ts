/**
 * Audit Logging Service
 * Tracks user actions and system events
 */

export interface AuditEvent {
    id: string;
    timestamp: string;
    userId: string;
    userName: string;
    userRole: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'EXPORT' | 'LOGIN' | 'LOGOUT';
    resource: string;
    resourceId?: string;
    details?: string;
    ipAddress: string;
    userAgent?: string;
}

export interface AuditStats {
    totalEvents: number;
    todayEvents: number;
    uniqueUsers: number;
    mostActiveUser: string;
    topAction: string;
}

// Mock audit events
export const mockAuditEvents: AuditEvent[] = [
    { id: 'ae1', timestamp: '2026-01-22T10:45:00Z', userId: 'u1', userName: 'Admin User', userRole: 'ADMIN', action: 'UPDATE', resource: 'Student', resourceId: 's1234', details: 'Updated contact information', ipAddress: '192.168.1.100' },
    { id: 'ae2', timestamp: '2026-01-22T10:30:00Z', userId: 'u2', userName: 'Priya Sharma', userRole: 'ACCOUNTANT', action: 'CREATE', resource: 'Invoice', resourceId: 'inv5678', details: 'Created fee invoice for Term 2', ipAddress: '192.168.1.101' },
    { id: 'ae3', timestamp: '2026-01-22T10:15:00Z', userId: 'u3', userName: 'Rajesh Kumar', userRole: 'TEACHER', action: 'UPDATE', resource: 'Attendance', resourceId: 'att9012', details: 'Marked attendance for Class 10-A', ipAddress: '192.168.1.102' },
    { id: 'ae4', timestamp: '2026-01-22T10:00:00Z', userId: 'u1', userName: 'Admin User', userRole: 'ADMIN', action: 'EXPORT', resource: 'Report', details: 'Exported fee defaulters report', ipAddress: '192.168.1.100' },
    { id: 'ae5', timestamp: '2026-01-22T09:45:00Z', userId: 'u4', userName: 'Dr. Anita Menon', userRole: 'PRINCIPAL', action: 'VIEW', resource: 'Analytics', details: 'Viewed fee collection dashboard', ipAddress: '192.168.1.103' },
    { id: 'ae6', timestamp: '2026-01-22T09:30:00Z', userId: 'u2', userName: 'Priya Sharma', userRole: 'ACCOUNTANT', action: 'UPDATE', resource: 'Payment', resourceId: 'pay3456', details: 'Recorded fee payment ₹25,000', ipAddress: '192.168.1.101' },
    { id: 'ae7', timestamp: '2026-01-22T09:15:00Z', userId: 'u1', userName: 'Admin User', userRole: 'ADMIN', action: 'CREATE', resource: 'User', resourceId: 'u5', details: 'Created new teacher account', ipAddress: '192.168.1.100' },
    { id: 'ae8', timestamp: '2026-01-22T09:00:00Z', userId: 'u3', userName: 'Rajesh Kumar', userRole: 'TEACHER', action: 'CREATE', resource: 'Marks', resourceId: 'mk7890', details: 'Entered marks for Mathematics', ipAddress: '192.168.1.102' },
    { id: 'ae9', timestamp: '2026-01-22T08:45:00Z', userId: 'u1', userName: 'Admin User', userRole: 'ADMIN', action: 'LOGIN', resource: 'Session', details: 'Logged in successfully', ipAddress: '192.168.1.100' },
    { id: 'ae10', timestamp: '2026-01-21T17:30:00Z', userId: 'u2', userName: 'Priya Sharma', userRole: 'ACCOUNTANT', action: 'LOGOUT', resource: 'Session', details: 'Logged out', ipAddress: '192.168.1.101' },
    { id: 'ae11', timestamp: '2026-01-21T16:00:00Z', userId: 'u4', userName: 'Dr. Anita Menon', userRole: 'PRINCIPAL', action: 'UPDATE', resource: 'Settings', details: 'Updated grading scale', ipAddress: '192.168.1.103' },
    { id: 'ae12', timestamp: '2026-01-21T15:30:00Z', userId: 'u1', userName: 'Admin User', userRole: 'ADMIN', action: 'DELETE', resource: 'Student', resourceId: 's9999', details: 'Deleted duplicate student record', ipAddress: '192.168.1.100' },
    { id: 'ae13', timestamp: '2026-01-21T14:00:00Z', userId: 'u3', userName: 'Rajesh Kumar', userRole: 'TEACHER', action: 'EXPORT', resource: 'Report', details: 'Exported class attendance report', ipAddress: '192.168.1.102' },
    { id: 'ae14', timestamp: '2026-01-21T12:00:00Z', userId: 'u2', userName: 'Priya Sharma', userRole: 'ACCOUNTANT', action: 'VIEW', resource: 'Defaulters', details: 'Viewed fee defaulters list', ipAddress: '192.168.1.101' },
    { id: 'ae15', timestamp: '2026-01-21T10:00:00Z', userId: 'u1', userName: 'Admin User', userRole: 'ADMIN', action: 'UPDATE', resource: 'Certificate', resourceId: 'cert123', details: 'Issued TC for student', ipAddress: '192.168.1.100' },
];

/**
 * Get audit statistics
 */
export function getAuditStats(): AuditStats {
    const today = new Date().toISOString().split('T')[0];
    const todayEvents = mockAuditEvents.filter(e => e.timestamp.startsWith(today)).length;

    const userCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};

    mockAuditEvents.forEach(e => {
        userCounts[e.userName] = (userCounts[e.userName] || 0) + 1;
        actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
    });

    const mostActiveUser = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return {
        totalEvents: mockAuditEvents.length,
        todayEvents,
        uniqueUsers: Object.keys(userCounts).length,
        mostActiveUser,
        topAction,
    };
}

/**
 * Filter audit events
 */
export function filterAuditEvents(
    events: AuditEvent[],
    filters: { action?: string; user?: string; resource?: string; dateFrom?: string; dateTo?: string }
): AuditEvent[] {
    return events.filter(e => {
        if (filters.action && e.action !== filters.action) return false;
        if (filters.user && !e.userName.toLowerCase().includes(filters.user.toLowerCase())) return false;
        if (filters.resource && !e.resource.toLowerCase().includes(filters.resource.toLowerCase())) return false;
        if (filters.dateFrom && e.timestamp < filters.dateFrom) return false;
        if (filters.dateTo && e.timestamp > filters.dateTo) return false;
        return true;
    });
}

/**
 * Export audit log to CSV
 */
export function exportAuditToCSV(events: AuditEvent[]): string {
    const headers = ['Timestamp', 'User', 'Role', 'Action', 'Resource', 'Resource ID', 'Details', 'IP Address'];
    const rows = events.map(e => [
        e.timestamp,
        e.userName,
        e.userRole,
        e.action,
        e.resource,
        e.resourceId || '',
        e.details || '',
        e.ipAddress,
    ]);

    return [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
}

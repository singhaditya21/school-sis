'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_AUTH_MODES, API_GROUPS, API_ROUTES, type ApiRouteDoc } from './route-catalog';

const METHOD_COLORS: Record<string, string> = {
    GET: 'bg-green-600 text-white',
    POST: 'bg-blue-600 text-white',
    PUT: 'bg-orange-500 text-white',
    PATCH: 'bg-yellow-500 text-white',
    DELETE: 'bg-red-600 text-white',
};

const AUTH_BADGE: Record<string, string> = {
    public: 'bg-gray-100 text-gray-700',
    session: 'bg-indigo-100 text-indigo-700',
    'session-permission': 'bg-purple-100 text-purple-700',
    'integration-key': 'bg-cyan-100 text-cyan-700',
    'service-token': 'bg-amber-100 text-amber-800',
    'webhook-signature': 'bg-rose-100 text-rose-700',
};

export default function ApiDocsPage() {
    const [group, setGroup] = useState('All');
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);

    const routes = useMemo(() => {
        const term = search.trim().toLowerCase();
        return API_ROUTES.filter((route) => {
            if (group !== 'All' && route.group !== group) return false;
            if (term === '') return true;
            return (
                route.path.toLowerCase().includes(term) ||
                route.summary.toLowerCase().includes(term) ||
                (route.permission ?? '').toLowerCase().includes(term)
            );
        });
    }, [group, search]);

    const usedAuthModes = useMemo(
        () => Array.from(new Set(API_ROUTES.map((route) => route.auth))),
        [],
    );

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">API Reference</h1>
                    <p className="text-gray-600 mt-1">
                        The {API_ROUTES.length} HTTP endpoints this deployment actually serves, read from the route
                        handlers themselves. A test fails the build if a route is added or removed without updating
                        this page.
                    </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                    Base path: /api
                </Badge>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Authentication</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p className="text-gray-600">
                        There is no single credential for the whole surface. Each endpoint uses one of the modes
                        below — most of the product API is a first-party browser session, not a bearer token.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                        {usedAuthModes.map((mode) => (
                            <div key={mode} className="rounded-md border p-3">
                                <Badge className={`${AUTH_BADGE[mode]} mb-2`}>{API_AUTH_MODES[mode].label}</Badge>
                                <p className="text-xs text-gray-600">{API_AUTH_MODES[mode].description}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-2">
                {['All', ...API_GROUPS].map((entry) => (
                    <button
                        key={entry}
                        onClick={() => setGroup(entry)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${group === entry ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                    >
                        {entry}
                    </button>
                ))}
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Filter by path, description or permission"
                    className="ml-auto w-full sm:w-80"
                />
            </div>

            {routes.length === 0 ? (
                <Card>
                    <CardContent className="py-8 text-center text-sm text-gray-500">
                        No endpoint matches that filter.
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {routes.map((route) => (
                        <EndpointCard
                            key={route.path}
                            route={route}
                            expanded={expanded === route.path}
                            onToggle={() => setExpanded(expanded === route.path ? null : route.path)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function EndpointCard({
    route,
    expanded,
    onToggle,
}: {
    route: ApiRouteDoc;
    expanded: boolean;
    onToggle: () => void;
}) {
    const hasDetail = Boolean(route.query?.length || route.note || route.permission);

    return (
        <Card className={expanded ? 'border-blue-300' : ''}>
            <CardContent className="py-3">
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex w-full items-center gap-3 text-left"
                    aria-expanded={expanded}
                >
                    <span className="flex shrink-0 gap-1">
                        {route.methods.map((method) => (
                            <Badge key={method} className={`${METHOD_COLORS[method]} font-mono`}>
                                {method}
                            </Badge>
                        ))}
                    </span>
                    <code className="font-mono text-sm flex-1 break-all">{route.path}</code>
                    <Badge className={`${AUTH_BADGE[route.auth]} shrink-0 hidden md:inline-flex`}>
                        {API_AUTH_MODES[route.auth].label}
                    </Badge>
                    {hasDetail && (
                        <svg
                            className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    )}
                </button>

                <p className="text-sm text-gray-600 mt-2">{route.summary}</p>

                {expanded && hasDetail && (
                    <div className="mt-4 pt-4 border-t space-y-4 text-sm">
                        {route.permission && (
                            <p>
                                <span className="font-medium">Required permission:</span>{' '}
                                <code className="font-mono text-purple-700">{route.permission}</code>
                            </p>
                        )}
                        {route.query && route.query.length > 0 && (
                            <div>
                                <h4 className="font-medium mb-2">Query parameters</h4>
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Name</th>
                                            <th className="px-3 py-2 text-left">Required</th>
                                            <th className="px-3 py-2 text-left">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {route.query.map((param) => (
                                            <tr key={param.name} className="border-b last:border-0">
                                                <td className="px-3 py-2 font-mono text-blue-700">{param.name}</td>
                                                <td className="px-3 py-2">
                                                    <Badge variant={param.required ? 'default' : 'outline'} className="text-xs">
                                                        {param.required ? 'Required' : 'Optional'}
                                                    </Badge>
                                                </td>
                                                <td className="px-3 py-2 text-gray-600">{param.description}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {route.note && (
                            <p className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                                {route.note}
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

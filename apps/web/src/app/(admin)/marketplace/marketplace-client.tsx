'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Check, Laptop, Bed, Bus, BookOpen, GraduationCap, Plane, Stethoscope, Briefcase } from 'lucide-react';
import { toggleModuleAction } from '@/lib/actions/marketplace';

const PLUGINS = [
    {
        id: 'LMS',
        title: 'Learning Management (LMS)',
        description: 'Online classes, assignments, and digital gradebook.',
        icon: Laptop,
        category: 'Academics',
        price: 'Included'
    },
    {
        id: 'HOSTEL',
        title: 'Hostel Management',
        description: 'Manage dormitories, room allocations, and hostel fees.',
        icon: Bed,
        category: 'Operations',
        price: 'Add-on'
    },
    {
        id: 'TRANSPORT',
        title: 'Transport Fleet',
        description: 'Bus routing, vehicle tracking, and driver assignments.',
        icon: Bus,
        category: 'Operations',
        price: 'Add-on'
    },
    {
        id: 'LIBRARY',
        title: 'Digital Library',
        description: 'Catalog books, manage issues/returns, track fines.',
        icon: BookOpen,
        category: 'Academics',
        price: 'Included'
    },
    {
        id: 'ALUMNI',
        title: 'Alumni Network',
        description: 'Engage past students, track donations, and host events.',
        icon: GraduationCap,
        category: 'Community',
        price: 'Add-on'
    },
    {
        id: 'INTERNATIONAL',
        title: 'International Ops',
        description: 'Visa tracking and host family management for global students.',
        icon: Plane,
        category: 'Specialty',
        price: 'Add-on'
    },
    {
        id: 'HEALTH',
        title: 'Health Clinic',
        description: 'Medical incident logs, allergies, and immunization records.',
        icon: Stethoscope,
        category: 'Operations',
        price: 'Included'
    },
    {
        id: 'HR',
        title: 'HR & Payroll',
        description: 'Manage staff, leaves, and generate payroll slips.',
        icon: Briefcase,
        category: 'Operations',
        price: 'Add-on'
    },
];

export default function MarketplaceClient({ activeModules }: { activeModules: string[] }) {
    const [optimisticActive, setOptimisticActive] = useState<Set<string>>(new Set(activeModules));
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

    const handleToggle = async (moduleId: string) => {
        const isCurrentlyActive = optimisticActive.has(moduleId);
        const newActiveState = !isCurrentlyActive;

        setLoadingMap(prev => ({ ...prev, [moduleId]: true }));
        
        try {
            await toggleModuleAction(moduleId, newActiveState);
            
            // Update local state
            setOptimisticActive(prev => {
                const next = new Set(prev);
                if (newActiveState) next.add(moduleId);
                else next.delete(moduleId);
                return next;
            });
        } catch (error) {
            console.error('Failed to toggle module:', error);
        } finally {
            setLoadingMap(prev => ({ ...prev, [moduleId]: false }));
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {PLUGINS.map((plugin) => {
                const Icon = plugin.icon;
                const isActive = optimisticActive.has(plugin.id);
                const isLoading = loadingMap[plugin.id];

                return (
                    <Card key={plugin.id} className={`relative overflow-hidden transition-all duration-200 border-2 ${isActive ? 'border-blue-500 shadow-blue-100' : 'border-transparent shadow-sm hover:shadow-md'}`}>
                        {isActive && (
                            <div className="absolute top-0 right-0 p-2">
                                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">
                                    <Check className="w-3 h-3 mr-1" /> Installed
                                </Badge>
                            </div>
                        )}
                        <CardHeader className="pb-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                <Icon className="w-6 h-6" />
                            </div>
                            <CardTitle className="text-lg">{plugin.title}</CardTitle>
                            <CardDescription className="h-10 line-clamp-2">{plugin.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="pb-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-500">{plugin.category}</span>
                                <span className="font-medium text-slate-900 dark:text-slate-100">{plugin.price}</span>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button 
                                variant={isActive ? "outline" : "default"} 
                                className="w-full"
                                onClick={() => handleToggle(plugin.id)}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : isActive ? (
                                    'Uninstall'
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4 mr-2" /> Install Module
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </Card>
                );
            })}
        </div>
    );
}

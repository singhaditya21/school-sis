'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function EditFeePlanPage() {
    const params = useParams();
    const id = params.id as string;
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [plan, setPlan] = useState({
        name: '',
        description: '',
        amount: '',
        frequency: 'quarterly',
        applicableGrades: [] as string[],
    });

    useEffect(() => {
        // Mock fetch plan data
        setTimeout(() => {
            setPlan({
                name: 'Q1 Tuition Fee',
                description: 'First quarter tuition fee for academic year 2025-26',
                amount: '15000',
                frequency: 'quarterly',
                applicableGrades: ['1', '2', '3', '4', '5'],
            });
            setIsLoading(false);
        }, 500);
    }, [id]);

    if (isLoading) {
        return (
            <div className="container mx-auto p-6">
                <div className="animate-pulse">
                    <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
                    <div className="h-64 bg-gray-200 rounded"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-2xl">
            <div className="mb-6">
                <Link href="/fees" className="text-blue-600 hover:underline">← Back to Fee Plans</Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Edit Fee Plan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Plan Name</Label>
                        <Input
                            value={plan.name}
                            onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <Label>Description</Label>
                        <Textarea
                            value={plan.description}
                            onChange={(e) => setPlan({ ...plan, description: e.target.value })}
                            rows={3}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Amount (₹)</Label>
                            <Input
                                type="number"
                                value={plan.amount}
                                onChange={(e) => setPlan({ ...plan, amount: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Frequency</Label>
                            <Select
                                value={plan.frequency}
                                onValueChange={(value) => setPlan({ ...plan, frequency: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="one-time">One-time</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="quarterly">Quarterly</SelectItem>
                                    <SelectItem value="annually">Annually</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex gap-4 pt-4">
                        <Button disabled={isSaving}>
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Link href="/fees">
                            <Button variant="outline">Cancel</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

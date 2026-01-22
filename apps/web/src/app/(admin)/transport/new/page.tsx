'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewRoutePage() {
    const [isSubmitting, setIsSubmitting] = useState(false);

    return (
        <div className="container mx-auto p-6 max-w-2xl">
            <div className="mb-6">
                <Link href="/transport" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Add New Transport Route</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Route Name</Label>
                            <Input placeholder="e.g., Route A - North Zone" />
                        </div>
                        <div>
                            <Label>Route Number</Label>
                            <Input placeholder="e.g., R001" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Start Point</Label>
                            <Input placeholder="Starting location" />
                        </div>
                        <div>
                            <Label>End Point</Label>
                            <Input placeholder="Ending location" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Vehicle Number</Label>
                            <Input placeholder="e.g., DL-01-AB-1234" />
                        </div>
                        <div>
                            <Label>Driver Name</Label>
                            <Input placeholder="Driver name" />
                        </div>
                    </div>
                    <div>
                        <Label>Driver Contact</Label>
                        <Input type="tel" placeholder="+91 9876543210" />
                    </div>
                    <div className="flex gap-4 pt-4">
                        <Button disabled={isSubmitting}>
                            {isSubmitting ? 'Creating...' : 'Create Route'}
                        </Button>
                        <Link href="/transport">
                            <Button variant="outline">Cancel</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

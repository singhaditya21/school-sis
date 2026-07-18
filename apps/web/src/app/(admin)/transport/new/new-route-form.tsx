'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createRouteAction } from '@/lib/actions/transport';

export default function NewRouteForm() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [name, setName] = useState('');
    const [routeNumber, setRouteNumber] = useState('');
    const [startPoint, setStartPoint] = useState('');
    const [endPoint, setEndPoint] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [driverName, setDriverName] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [monthlyFee, setMonthlyFee] = useState('');

    const [errors, setErrors] = useState<Record<string, string>>({});

    const handlePhoneChange = (val: string) => {
        setDriverPhone(val);
        const phoneRegex = /^[0-9+\-\s]*$/;
        if (!phoneRegex.test(val)) {
            setErrors(prev => ({
                ...prev,
                driverPhone: 'Invalid contact format: must contain only digits, +, -, or spaces'
            }));
        } else {
            setErrors(prev => {
                const copy = { ...prev };
                delete copy.driverPhone;
                return copy;
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const newErrors: Record<string, string> = {};

        if (!name) newErrors.name = 'Route name is required';
        if (!routeNumber) newErrors.routeNumber = 'Route number is required';
        if (!startPoint) newErrors.startPoint = 'Start point is required';
        if (!endPoint) newErrors.endPoint = 'End point is required';
        if (!vehicleNumber) newErrors.vehicleNumber = 'Vehicle number is required';
        if (!driverName) newErrors.driverName = 'Driver name is required';
        if (!driverPhone) {
            newErrors.driverPhone = 'Driver contact is required';
        } else {
            const phoneRegex = /^[0-9+\-\s]+$/;
            if (!phoneRegex.test(driverPhone)) {
                newErrors.driverPhone = 'Invalid contact format: must contain only digits, +, -, or spaces';
            }
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await createRouteAction({
                name,
                routeNumber,
                startPoint,
                endPoint,
                vehicleNumber,
                driverName,
                driverPhone,
                monthlyFee: monthlyFee || undefined
            });

            if (res.success) {
                router.push('/transport');
                router.refresh();
            }
        } catch (error: unknown) {
            setErrors({ submit: (error as { message?: string }).message || 'Failed to create route' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-2xl">
            <div className="mb-6">
                <Link href="/transport" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Add New Transport Route</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {errors.submit && (
                            <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm" data-testid="submit-error">
                                {errors.submit}
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Route Name</Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Route A - North Zone"
                                    data-testid="route-name-input"
                                />
                                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                            </div>
                            <div>
                                <Label>Route Number</Label>
                                <Input
                                    value={routeNumber}
                                    onChange={(e) => setRouteNumber(e.target.value)}
                                    placeholder="e.g., R001"
                                    data-testid="route-number-input"
                                />
                                {errors.routeNumber && <p className="text-red-500 text-xs mt-1">{errors.routeNumber}</p>}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Start Point</Label>
                                <Input
                                    value={startPoint}
                                    onChange={(e) => setStartPoint(e.target.value)}
                                    placeholder="Starting location"
                                    data-testid="start-point-input"
                                />
                                {errors.startPoint && <p className="text-red-500 text-xs mt-1">{errors.startPoint}</p>}
                            </div>
                            <div>
                                <Label>End Point</Label>
                                <Input
                                    value={endPoint}
                                    onChange={(e) => setEndPoint(e.target.value)}
                                    placeholder="Ending location"
                                    data-testid="end-point-input"
                                />
                                {errors.endPoint && <p className="text-red-500 text-xs mt-1">{errors.endPoint}</p>}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Vehicle Number</Label>
                                <Input
                                    value={vehicleNumber}
                                    onChange={(e) => setVehicleNumber(e.target.value)}
                                    placeholder="e.g., DL-01-AB-1234"
                                    data-testid="vehicle-number-input"
                                />
                                {errors.vehicleNumber && <p className="text-red-500 text-xs mt-1">{errors.vehicleNumber}</p>}
                            </div>
                            <div>
                                <Label>Driver Name</Label>
                                <Input
                                    value={driverName}
                                    onChange={(e) => setDriverName(e.target.value)}
                                    placeholder="Driver name"
                                    data-testid="driver-name-input"
                                />
                                {errors.driverName && <p className="text-red-500 text-xs mt-1">{errors.driverName}</p>}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Driver Contact</Label>
                                <Input
                                    type="tel"
                                    value={driverPhone}
                                    onChange={(e) => handlePhoneChange(e.target.value)}
                                    placeholder="+91 9876543210"
                                    data-testid="driver-contact-input"
                                />
                                {errors.driverPhone && (
                                    <p className="text-red-500 text-xs mt-1" data-testid="phone-error">
                                        {errors.driverPhone}
                                    </p>
                                )}
                            </div>
                            <div>
                                <Label>Monthly Fee</Label>
                                <Input
                                    type="number"
                                    value={monthlyFee}
                                    onChange={(e) => setMonthlyFee(e.target.value)}
                                    placeholder="e.g. 1500"
                                    data-testid="monthly-fee-input"
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 pt-4">
                            <Button type="submit" disabled={isSubmitting || !!errors.driverPhone} data-testid="submit-btn">
                                {isSubmitting ? 'Creating...' : 'Create Route'}
                            </Button>
                            <Link href="/transport">
                                <Button type="button" variant="outline" data-testid="cancel-btn">Cancel</Button>
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

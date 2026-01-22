'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function NewTimetablePage() {
    const [isSubmitting, setIsSubmitting] = useState(false);

    return (
        <div className="container mx-auto p-6 max-w-2xl">
            <div className="mb-6">
                <Link href="/timetable" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Create New Timetable Entry</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Class</Label>
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select class" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1a">Class 1A</SelectItem>
                                    <SelectItem value="1b">Class 1B</SelectItem>
                                    <SelectItem value="2a">Class 2A</SelectItem>
                                    <SelectItem value="2b">Class 2B</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Subject</Label>
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select subject" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="math">Mathematics</SelectItem>
                                    <SelectItem value="science">Science</SelectItem>
                                    <SelectItem value="english">English</SelectItem>
                                    <SelectItem value="hindi">Hindi</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Day</Label>
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select day" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="monday">Monday</SelectItem>
                                    <SelectItem value="tuesday">Tuesday</SelectItem>
                                    <SelectItem value="wednesday">Wednesday</SelectItem>
                                    <SelectItem value="thursday">Thursday</SelectItem>
                                    <SelectItem value="friday">Friday</SelectItem>
                                    <SelectItem value="saturday">Saturday</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Period</Label>
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select period" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">Period 1 (8:00-8:45)</SelectItem>
                                    <SelectItem value="2">Period 2 (8:45-9:30)</SelectItem>
                                    <SelectItem value="3">Period 3 (9:45-10:30)</SelectItem>
                                    <SelectItem value="4">Period 4 (10:30-11:15)</SelectItem>
                                    <SelectItem value="5">Period 5 (11:30-12:15)</SelectItem>
                                    <SelectItem value="6">Period 6 (12:15-1:00)</SelectItem>
                                    <SelectItem value="7">Period 7 (2:00-2:45)</SelectItem>
                                    <SelectItem value="8">Period 8 (2:45-3:30)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <Label>Teacher</Label>
                        <Input placeholder="Assigned teacher" />
                    </div>
                    <div>
                        <Label>Room</Label>
                        <Input placeholder="e.g., Room 101" />
                    </div>
                    <div className="flex gap-4 pt-4">
                        <Button disabled={isSubmitting}>
                            {isSubmitting ? 'Creating...' : 'Add Entry'}
                        </Button>
                        <Link href="/timetable">
                            <Button variant="outline">Cancel</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function NewMessageTemplatePage() {
    const [isSubmitting, setIsSubmitting] = useState(false);

    return (
        <div className="container mx-auto p-6 max-w-2xl">
            <div className="mb-6">
                <Link href="/messages/templates" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Create Message Template</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Template Name</Label>
                        <Input placeholder="e.g., Fee Reminder" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Category</Label>
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="fee">Fee Reminder</SelectItem>
                                    <SelectItem value="attendance">Attendance Alert</SelectItem>
                                    <SelectItem value="exam">Exam Notification</SelectItem>
                                    <SelectItem value="event">Event Announcement</SelectItem>
                                    <SelectItem value="general">General Notice</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Channel</Label>
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select channel" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sms">SMS</SelectItem>
                                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                    <SelectItem value="email">Email</SelectItem>
                                    <SelectItem value="push">Push Notification</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <Label>Subject (for Email)</Label>
                        <Input placeholder="Email subject line" />
                    </div>
                    <div>
                        <Label>Message Body</Label>
                        <Textarea
                            placeholder="Enter message content. Use {{variable}} for dynamic values like {{studentName}}, {{amount}}, {{dueDate}}"
                            rows={6}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Available variables: {'{'}studentName{'}'}, {'{'}parentName{'}'}, {'{'}amount{'}'}, {'{'}dueDate{'}'}, {'{'}className{'}'}
                        </p>
                    </div>
                    <div className="flex gap-4 pt-4">
                        <Button disabled={isSubmitting}>
                            {isSubmitting ? 'Creating...' : 'Create Template'}
                        </Button>
                        <Link href="/messages/templates">
                            <Button variant="outline">Cancel</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

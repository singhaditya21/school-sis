'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TallyExportForm() {
    const [isLoading, setIsLoading] = useState(false);
    
    // Default to today
    const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
    const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));

    const handleExport = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const response = await fetch('/api/integrations/tally/vouchers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromDate, toDate })
            });

            if (!response.ok) {
                throw new Error('Export failed');
            }

            // Trigger file download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tally_vouchers_${fromDate}_to_${toDate}.xml`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error('Failed to export Tally XML:', error);
            toast.error('Failed to generate Tally export. Please check the date range and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleExport} className="space-y-5">
            <div className="space-y-2">
                <Label htmlFor="fromDate" className="text-slate-700">From Date</Label>
                <Input 
                    id="fromDate"
                    type="date" 
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    required
                    className="border-slate-300"
                />
            </div>
            
            <div className="space-y-2">
                <Label htmlFor="toDate" className="text-slate-700">To Date</Label>
                <Input 
                    id="toDate"
                    type="date" 
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    required
                    className="border-slate-300"
                />
            </div>

            <Button 
                type="submit" 
                disabled={isLoading} 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2 h-12 mt-6"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating XML...
                    </>
                ) : (
                    <>
                        <FileDown className="w-5 h-5" />
                        Download Tally XML
                    </>
                )}
            </Button>
            
            <p className="text-xs text-center text-slate-500">
                Downloaded file can be directly imported into Tally using: <br/>
                <span className="font-mono mt-1 block">Gateway of Tally &gt; Import Data &gt; Vouchers</span>
            </p>
        </form>
    );
}

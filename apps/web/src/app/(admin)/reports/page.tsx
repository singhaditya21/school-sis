import ReportBuilder from './report-builder';

export const metadata = {
    title: 'Reporting Engine | School SIS',
    description: 'Dynamic report builder for School SIS',
};

export default function ReportsPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Reporting Engine</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Build and export custom reports from your school's data.
                    </p>
                </div>
            </div>
            
            <ReportBuilder />
        </div>
    );
}

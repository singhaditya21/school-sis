import { getUniversityCoursesAction } from '@/lib/actions/higher_ed';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default async function UniversityCoursesPage() {
    const courses = await getUniversityCoursesAction();

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 bg-muted/20 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-foreground">Course Catalog</h1>
                    <p className="text-muted-foreground mt-2 text-base">Manage degree-specific courses, CBCS credits, and faculty syllabi.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="bg-card">Import Syllabi</Button>
                    <Button className="bg-primary hover:bg-primary/90">Add New Course</Button>
                </div>
            </div>

            <Card className="border-0 shadow-lg bg-card overflow-hidden mt-8">
                <CardHeader className="bg-muted border-b border-border px-6 py-5 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xl">Associated Courses</CardTitle>
                        <CardDescription>Courses mapped across all university programs.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-card border-b border-border text-xs text-muted-foreground uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Course Code</th>
                                    <th className="px-6 py-4">Title</th>
                                    <th className="px-6 py-4">Credits</th>
                                    <th className="px-6 py-4">Parent Program</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {courses.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                                            No courses found. Add a course to start assigning faculty workloads.
                                        </td>
                                    </tr>
                                )}
                                {courses.map((course) => (
                                    <tr key={course.id} className="hover:bg-muted transition-colors group">
                                        <td className="px-6 py-4 font-mono font-bold text-foreground">{course.code}</td>
                                        <td className="px-6 py-4 font-semibold text-foreground">{course.title}</td>
                                        <td className="px-6 py-4">
                                            <Badge variant="secondary" className="bg-muted text-foreground font-bold">{course.credits} Cr</Badge>
                                        </td>
                                        <td className="px-6 py-4 text-foreground font-medium">
                                            {course.programName} ({course.degreeType})
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <Button variant="ghost" size="sm" className="hidden lg:inline-flex text-blue-600 hover:text-blue-800 hover:bg-accent font-semibold">Assign Faculty</Button>
                                            <Button variant="outline" size="sm" className="font-semibold">Edit</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

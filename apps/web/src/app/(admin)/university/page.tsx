import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getUniversityDashboardSummaryAction,
  getUniversityProgramsAction,
} from "@/lib/actions/higher_ed";
import { HigherEducationForms } from "./HigherEducationForms";

export default async function UniversityDashboard() {
  const [programs, summary] = await Promise.all([
    getUniversityProgramsAction(),
    getUniversityDashboardSummaryAction(),
  ]);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-black text-foreground mb-2">
          Higher Education Administration
        </h1>
        <p className="text-muted-foreground">
          Manage degree programs, credit-bearing courses, and faculty allocation
          records.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          ["Programs", summary.totalPrograms],
          ["Courses", summary.totalCourses],
          ["Faculty allocations", summary.facultyAllocations],
          ["Assigned hours", summary.assignedHours],
        ].map(([label, value]) => (
          <Card key={label} className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-3xl">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/university/courses"
          className="rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md"
        >
          <Badge className="mb-4">Live</Badge>
          <h2 className="text-xl font-semibold">Programs & Courses</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Maintain degree pathways, course codes, credits, and catalog
            ownership.
          </p>
        </Link>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <Badge className="mb-4" variant="secondary">
            Data foundation live
          </Badge>
          <h2 className="text-xl font-semibold">Faculty Workload</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Allocation and assigned-hour records are included in the live
            summary.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6">
          <Badge className="mb-4" variant="outline">
            Next rollout
          </Badge>
          <h2 className="text-xl font-semibold">Research & Accreditation</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Grant, ethics-review, publication, and accreditation evidence
            workflows are not yet enabled.
          </p>
        </div>
      </div>

      <HigherEducationForms programs={programs} />

      <Card className="border-border shadow-sm bg-card overflow-hidden">
        <CardHeader className="bg-muted border-b border-border px-6 py-5">
          <CardTitle className="text-xl">Degree Programs</CardTitle>
          <CardDescription>
            Programs configured for this institution only.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-card border-b border-border text-xs text-muted-foreground uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Program</th>
                  <th className="px-6 py-4">Degree</th>
                  <th className="px-6 py-4">Duration</th>
                  <th className="px-6 py-4">Credits</th>
                  <th className="px-6 py-4">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {programs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-muted-foreground"
                    >
                      No degree programs configured.
                    </td>
                  </tr>
                ) : (
                  programs.map((program) => (
                    <tr key={program.id} className="hover:bg-muted/60">
                      <td className="px-6 py-4 font-semibold">
                        {program.name}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline">{program.degreeType}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        {program.durationYears} years
                      </td>
                      <td className="px-6 py-4 font-mono">
                        {program.totalCredits}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "medium",
                        }).format(new Date(program.createdAt))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

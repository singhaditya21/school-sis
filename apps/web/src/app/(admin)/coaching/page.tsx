import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getActiveBatchesAction,
  getCoachingDashboardSummaryAction,
} from "@/lib/actions/coaching";
import CreateBatchForm from "./components/CreateBatchForm";

function displayDate(value: string | Date | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export default async function CoachingDashboard() {
  const [batches, summary] = await Promise.all([
    getActiveBatchesAction(),
    getCoachingDashboardSummaryAction(),
  ]);

  const metrics = [
    {
      label: "Active batches",
      value: summary.activeBatches,
      detail: "Currently operating cohorts",
    },
    {
      label: "Upcoming tests",
      value: summary.upcomingTests,
      detail: "Scheduled after today",
    },
    {
      label: "Assessed learners",
      value: summary.assessedStudents,
      detail: "Distinct learners with results",
    },
    {
      label: "Average score",
      value:
        summary.averageScorePercent == null
          ? "No results"
          : `${summary.averageScorePercent}%`,
      detail: "Across recorded test-series results",
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 bg-muted/20 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Coaching Operations
          </h1>
          <p className="text-muted-foreground mt-2 text-base">
            Manage cohorts and monitor scheduled assessments using recorded
            institutional data.
          </p>
        </div>
        <Button asChild variant="outline" className="bg-card">
          <Link href="/coaching/tests">View test series</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric) => (
          <Card key={metric.label} className="border-border shadow-sm bg-card">
            <CardHeader className="pb-2">
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="text-3xl">{metric.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {metric.detail}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border shadow-sm bg-card overflow-hidden">
        <CardHeader className="bg-muted border-b border-border px-6 py-5">
          <CardTitle className="text-xl">Active Batches</CardTitle>
          <CardDescription>
            Participation and scoring are calculated only from saved test
            results.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-card border-b border-border text-xs text-muted-foreground uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Batch</th>
                  <th className="px-6 py-4">Target</th>
                  <th className="px-6 py-4">Participants</th>
                  <th className="px-6 py-4">Average Score</th>
                  <th className="px-6 py-4">Next Test</th>
                  <th className="px-6 py-4">Runs Through</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-muted-foreground"
                    >
                      No active batches found. Create the first cohort below.
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-muted/60">
                      <td className="px-6 py-4 font-semibold text-foreground">
                        {batch.name}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline">{batch.targetExam}</Badge>
                      </td>
                      <td className="px-6 py-4 font-mono">
                        {batch.participantCount}
                      </td>
                      <td className="px-6 py-4 font-mono">
                        {batch.averageScorePercent == null
                          ? "No results"
                          : `${batch.averageScorePercent}%`}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {displayDate(batch.nextTestAt)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {displayDate(batch.endDate)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <CreateBatchForm />
    </div>
  );
}

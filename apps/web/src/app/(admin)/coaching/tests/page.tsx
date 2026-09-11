import Link from "next/link";
import {
  getActiveBatchesAction,
  getTestSeriesAction,
} from "@/lib/actions/coaching";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScheduleTestForm } from "./ScheduleTestForm";

export default async function TestSeriesDashboard() {
  const [tests, batches] = await Promise.all([
    getTestSeriesAction(),
    getActiveBatchesAction(),
  ]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 bg-muted/20 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Test Series
          </h1>
          <p className="text-muted-foreground mt-2 text-base">
            Schedule assessments and review result coverage without simulated
            ranking claims.
          </p>
        </div>
        <Button asChild variant="outline" className="bg-card">
          <Link href="/coaching">Back to coaching</Link>
        </Button>
      </div>

      <ScheduleTestForm
        batches={batches.map(({ id, name }) => ({ id, name }))}
      />

      <Card className="border-border shadow-sm bg-card overflow-hidden">
        <CardHeader className="bg-muted border-b border-border px-6 py-5">
          <CardTitle className="text-xl">
            Scheduled and Completed Tests
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-card border-b border-border text-xs text-muted-foreground uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Test</th>
                  <th className="px-6 py-4">Batch</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Marks</th>
                  <th className="px-6 py-4">Results</th>
                  <th className="px-6 py-4">Average Score</th>
                  <th className="px-6 py-4">Scheduled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tests.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center text-muted-foreground"
                    >
                      No tests are scheduled.
                    </td>
                  </tr>
                ) : (
                  tests.map((test) => {
                    const isPast = new Date(test.scheduledAt) < new Date();
                    return (
                      <tr key={test.id} className="hover:bg-muted/60">
                        <td className="px-6 py-4 font-semibold text-foreground">
                          {test.testName}
                        </td>
                        <td className="px-6 py-4">{test.batchName}</td>
                        <td className="px-6 py-4">
                          <Badge variant="outline">
                            {isPast ? "Completed window" : "Scheduled"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 font-mono">
                          {test.totalMarks}
                        </td>
                        <td className="px-6 py-4 font-mono">
                          {test.resultCount}
                        </td>
                        <td className="px-6 py-4 font-mono">
                          {test.averageScorePercent == null
                            ? "No results"
                            : `${test.averageScorePercent}%`}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {new Intl.DateTimeFormat("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(test.scheduledAt))}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

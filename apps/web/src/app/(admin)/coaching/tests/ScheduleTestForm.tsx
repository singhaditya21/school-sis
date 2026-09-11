"use client";

import { useState } from "react";
import { scheduleCoachingTest } from "@/actions/coaching";

type BatchOption = { id: string; name: string };

export function ScheduleTestForm({ batches }: { batches: BatchOption[] }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    success: boolean;
    text: string;
  } | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setMessage(null);
    const result = await scheduleCoachingTest(formData);
    setMessage({
      success: result.success,
      text: result.success
        ? `Test "${result.data?.name}" scheduled.`
        : result.error || "Unable to schedule test.",
    });
    if (result.success) {
      (
        document.getElementById("coaching-test-form") as HTMLFormElement
      ).reset();
    }
    setPending(false);
  }

  return (
    <form
      id="coaching-test-form"
      action={submit}
      className="grid gap-4 rounded-xl border border-border bg-card p-6 md:grid-cols-2 lg:grid-cols-5"
    >
      <div className="lg:col-span-5">
        <h2 className="text-lg font-semibold">Schedule Test</h2>
        <p className="text-sm text-muted-foreground">
          New tests are bound to an active batch in the signed-in tenant.
        </p>
      </div>
      <label className="space-y-2 text-sm font-medium">
        Batch
        <select
          name="batchId"
          required
          disabled={batches.length === 0}
          className="w-full rounded-lg border border-border bg-background px-3 py-2"
        >
          <option value="">Select batch</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm font-medium lg:col-span-2">
        Test name
        <input
          name="testName"
          required
          minLength={3}
          maxLength={255}
          className="w-full rounded-lg border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="space-y-2 text-sm font-medium">
        Total marks
        <input
          name="totalMarks"
          type="number"
          required
          min={1}
          max={10000}
          className="w-full rounded-lg border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="space-y-2 text-sm font-medium">
        Scheduled at
        <input
          name="scheduledAt"
          type="datetime-local"
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2"
        />
      </label>
      <div className="flex items-center justify-between gap-4 lg:col-span-5">
        <div
          role="status"
          aria-live="polite"
          className={
            message?.success
              ? "text-sm text-emerald-700"
              : "text-sm text-destructive"
          }
        >
          {message?.text}
        </div>
        <button
          type="submit"
          disabled={pending || batches.length === 0}
          className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Scheduling…" : "Schedule test"}
        </button>
      </div>
    </form>
  );
}

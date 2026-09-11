"use client";

import { useState } from "react";
import {
  createUniversityCourseAction,
  createUniversityProgramAction,
  type UniversityProgram,
} from "@/lib/actions/higher_ed";

type Feedback = { success: boolean; text: string } | null;

function FeedbackMessage({ value }: { value: Feedback }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        value?.success ? "text-sm text-emerald-700" : "text-sm text-destructive"
      }
    >
      {value?.text}
    </div>
  );
}

export function HigherEducationForms({
  programs,
}: {
  programs: UniversityProgram[];
}) {
  const [programPending, setProgramPending] = useState(false);
  const [coursePending, setCoursePending] = useState(false);
  const [programFeedback, setProgramFeedback] = useState<Feedback>(null);
  const [courseFeedback, setCourseFeedback] = useState<Feedback>(null);

  async function createProgram(formData: FormData) {
    setProgramPending(true);
    const result = await createUniversityProgramAction(formData);
    setProgramFeedback({
      success: result.success,
      text: result.success
        ? `Program "${result.data?.name}" created.`
        : result.error || "Unable to create program.",
    });
    if (result.success)
      (
        document.getElementById("higher-ed-program-form") as HTMLFormElement
      ).reset();
    setProgramPending(false);
  }

  async function createCourse(formData: FormData) {
    setCoursePending(true);
    const result = await createUniversityCourseAction(formData);
    setCourseFeedback({
      success: result.success,
      text: result.success
        ? `Course "${result.data?.name}" created.`
        : result.error || "Unable to create course.",
    });
    if (result.success)
      (
        document.getElementById("higher-ed-course-form") as HTMLFormElement
      ).reset();
    setCoursePending(false);
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        id="higher-ed-program-form"
        action={createProgram}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Create Program</h2>
          <p className="text-sm text-muted-foreground">
            Define a tenant-scoped degree or diploma pathway.
          </p>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          Program name
          <input
            name="name"
            required
            minLength={3}
            maxLength={255}
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="space-y-2 text-sm font-medium">
            Degree
            <select name="degreeType" required className={inputClass}>
              <option value="BACHELOR">Bachelor</option>
              <option value="MASTER">Master</option>
              <option value="PHD">PhD</option>
              <option value="DIPLOMA">Diploma</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium">
            Years
            <input
              name="durationYears"
              type="number"
              min={1}
              max={12}
              required
              className={inputClass}
            />
          </label>
          <label className="space-y-2 text-sm font-medium">
            Credits
            <input
              name="totalCredits"
              type="number"
              min={1}
              max={1000}
              required
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex items-center justify-between gap-4">
          <FeedbackMessage value={programFeedback} />
          <button
            disabled={programPending}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
          >
            {programPending ? "Creating…" : "Create program"}
          </button>
        </div>
      </form>

      <form
        id="higher-ed-course-form"
        action={createCourse}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Create Course</h2>
          <p className="text-sm text-muted-foreground">
            Map a credit-bearing course to an existing program.
          </p>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          Program
          <select
            name="programId"
            required
            disabled={programs.length === 0}
            className={inputClass}
          >
            <option value="">Select program</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="space-y-2 text-sm font-medium">
            Code
            <input
              name="code"
              required
              minLength={2}
              maxLength={50}
              className={inputClass}
            />
          </label>
          <label className="col-span-2 space-y-2 text-sm font-medium">
            Title
            <input
              name="title"
              required
              minLength={3}
              maxLength={255}
              className={inputClass}
            />
          </label>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          Credits
          <input
            name="credits"
            type="number"
            min={1}
            max={50}
            required
            className={inputClass}
          />
        </label>
        <div className="flex items-center justify-between gap-4">
          <FeedbackMessage value={courseFeedback} />
          <button
            disabled={coursePending || programs.length === 0}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
          >
            {coursePending ? "Creating…" : "Create course"}
          </button>
        </div>
      </form>
    </div>
  );
}

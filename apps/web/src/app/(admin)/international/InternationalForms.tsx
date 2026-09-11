"use client";

import { useState } from "react";
import {
  createHostFamilyAction,
  createInternationalPlacementAction,
  createStudentVisaAction,
} from "@/lib/actions/international";

type Option = { id: string; name: string };
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

export function InternationalForms({
  students,
  families,
}: {
  students: Option[];
  families: Option[];
}) {
  const [visaPending, setVisaPending] = useState(false);
  const [familyPending, setFamilyPending] = useState(false);
  const [placementPending, setPlacementPending] = useState(false);
  const [visaFeedback, setVisaFeedback] = useState<Feedback>(null);
  const [familyFeedback, setFamilyFeedback] = useState<Feedback>(null);
  const [placementFeedback, setPlacementFeedback] = useState<Feedback>(null);
  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2";

  async function createVisa(formData: FormData) {
    setVisaPending(true);
    setVisaFeedback(null);
    const result = await createStudentVisaAction({
      studentId: String(formData.get("studentId") || ""),
      visaType: String(formData.get("visaType") || ""),
      countryOfOrigin: String(formData.get("countryOfOrigin") || ""),
      passportNumber: String(formData.get("passportNumber") || ""),
      issueDate: String(formData.get("issueDate") || ""),
      expirationDate: String(formData.get("expirationDate") || ""),
    });
    setVisaFeedback({
      success: result.success,
      text: result.success
        ? "Visa record created with an encrypted passport identifier."
        : result.error || "Unable to create visa record.",
    });
    if (result.success)
      (
        document.getElementById("international-visa-form") as HTMLFormElement
      ).reset();
    setVisaPending(false);
  }

  async function createFamily(formData: FormData) {
    setFamilyPending(true);
    setFamilyFeedback(null);
    const backgroundChecked = String(formData.get("backgroundChecked") || "");
    const result = await createHostFamilyAction({
      familyName: String(formData.get("familyName") || ""),
      address: String(formData.get("address") || ""),
      phone: String(formData.get("phone") || ""),
      backgroundChecked: backgroundChecked || undefined,
    });
    setFamilyFeedback({
      success: result.success,
      text: result.success
        ? "Host family registered."
        : result.error || "Unable to register host family.",
    });
    if (result.success)
      (
        document.getElementById("international-family-form") as HTMLFormElement
      ).reset();
    setFamilyPending(false);
  }

  async function createPlacement(formData: FormData) {
    setPlacementPending(true);
    setPlacementFeedback(null);
    const hostFamilyId = String(formData.get("hostFamilyId") || "");
    const result = await createInternationalPlacementAction({
      studentId: String(formData.get("studentId") || ""),
      hostFamilyId: hostFamilyId || undefined,
      placementYear: String(formData.get("placementYear") || ""),
    });
    setPlacementFeedback({
      success: result.success,
      text: result.success
        ? "International placement created."
        : result.error || "Unable to create placement.",
    });
    if (result.success)
      (
        document.getElementById(
          "international-placement-form",
        ) as HTMLFormElement
      ).reset();
    setPlacementPending(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <form
        id="international-visa-form"
        action={createVisa}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Add Visa Record</h2>
          <p className="text-sm text-muted-foreground">
            Passport identifiers are encrypted and only masked values are
            displayed.
          </p>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          Student
          <select
            name="studentId"
            required
            disabled={students.length === 0}
            className={inputClass}
          >
            <option value="">Select student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-2 text-sm font-medium">
            Visa type
            <input
              name="visaType"
              required
              minLength={2}
              maxLength={50}
              className={inputClass}
            />
          </label>
          <label className="space-y-2 text-sm font-medium">
            Country of origin
            <input
              name="countryOfOrigin"
              required
              minLength={2}
              maxLength={100}
              className={inputClass}
            />
          </label>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          Passport number
          <input
            name="passportNumber"
            required
            minLength={4}
            maxLength={100}
            autoComplete="off"
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-2 text-sm font-medium">
            Issue date
            <input
              name="issueDate"
              type="date"
              required
              className={inputClass}
            />
          </label>
          <label className="space-y-2 text-sm font-medium">
            Expiry date
            <input
              name="expirationDate"
              type="date"
              required
              className={inputClass}
            />
          </label>
        </div>
        <FeedbackMessage value={visaFeedback} />
        <button
          disabled={visaPending || students.length === 0}
          className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
        >
          {visaPending ? "Saving…" : "Save visa"}
        </button>
      </form>

      <form
        id="international-family-form"
        action={createFamily}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Register Host Family</h2>
          <p className="text-sm text-muted-foreground">
            Contact details remain tenant-scoped and encrypted at rest.
          </p>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          Family name
          <input
            name="familyName"
            required
            minLength={2}
            maxLength={255}
            className={inputClass}
          />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Address
          <textarea
            name="address"
            required
            minLength={5}
            maxLength={500}
            rows={3}
            className={inputClass}
          />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Phone
          <input
            name="phone"
            required
            minLength={7}
            maxLength={30}
            type="tel"
            className={inputClass}
          />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Background check date
          <input name="backgroundChecked" type="date" className={inputClass} />
        </label>
        <FeedbackMessage value={familyFeedback} />
        <button
          disabled={familyPending}
          className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
        >
          {familyPending ? "Saving…" : "Register family"}
        </button>
      </form>

      <form
        id="international-placement-form"
        action={createPlacement}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Create Placement</h2>
          <p className="text-sm text-muted-foreground">
            Link a student to an optional host family within this tenant.
          </p>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          Student
          <select
            name="studentId"
            required
            disabled={students.length === 0}
            className={inputClass}
          >
            <option value="">Select student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Host family
          <select name="hostFamilyId" className={inputClass}>
            <option value="">Unassigned</option>
            {families.map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Placement year
          <input
            name="placementYear"
            type="number"
            min={2000}
            max={2100}
            defaultValue={new Date().getFullYear()}
            required
            className={inputClass}
          />
        </label>
        <FeedbackMessage value={placementFeedback} />
        <button
          disabled={placementPending || students.length === 0}
          className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
        >
          {placementPending ? "Saving…" : "Create placement"}
        </button>
      </form>
    </div>
  );
}

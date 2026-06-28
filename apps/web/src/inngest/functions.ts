import { inngest } from "./client";

export const handleObjectUpserted = inngest.createFunction(
  { id: "handle-object-upserted", name: "Handle Object Upserted" },
  { event: "object.record.upserted" },
  async ({ event, step }) => {
    const { tenantId, objectName, recordId, payload } = event.data;

    await step.run("log-event", async () => {
      console.log(`[Automation] Received upsert for ${objectName} (${recordId}) in tenant ${tenantId}`);
    });

    // Phase 1 Automation MVP:
    // Here we could query a `workflows` table to find all active workflows
    // for `tenantId` where `trigger_event` === `object.record.upserted`
    // and `action_payload.objectName` === objectName.
    
    // For now, let's just simulate sending an email if it's a student
    if (objectName === "student") {
      await step.run("send-welcome-email", async () => {
        console.log(`[Automation] Sending welcome email for new student ${recordId}`);
        // await sendEmail(payload.email, "Welcome!");
      });
    }

    return { success: true, processed: true };
  }
);

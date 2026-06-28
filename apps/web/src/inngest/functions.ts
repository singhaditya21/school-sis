import { inngest } from "./client";
import { pool } from '@/lib/db';

export const handleObjectUpserted = inngest.createFunction(
  { id: "handle-object-upserted", name: "Handle Object Upserted", triggers: [{ event: "object.record.upserted" }] } as any,
  async ({ event, step }: any) => {
    const { tenantId, objectName, recordId, payload } = event.data;

    await step.run("log-event", async () => {
      console.log(`[Automation] Received upsert for ${objectName} (${recordId}) in tenant ${tenantId}`);
    });

    const workflows = await step.run("fetch-workflows", async () => {
      const query = `
        SELECT id, conditions, action_type, action_payload 
        FROM metadata_workflows
        WHERE tenant_id = $1 AND object_name = $2 AND trigger_event = $3 AND is_active = true
      `;
      const { rows } = await pool.query(query, [tenantId, objectName, 'object.record.upserted']);
      return rows;
    });

    if (workflows.length === 0) {
      return { success: true, processed: 0, message: "No active workflows found for this event." };
    }

    let processedCount = 0;

    for (const workflow of workflows) {
      // Basic Condition Engine Evaluation
      const conditionsMatch = await step.run(`eval-conditions-${workflow.id}`, async () => {
        const conditions = typeof workflow.conditions === 'string' ? JSON.parse(workflow.conditions) : workflow.conditions;
        
        // Simple evaluator: Every condition must be true (AND logic)
        for (const cond of conditions) {
          const { field, operator, value } = cond;
          const payloadValue = payload[field];
          
          if (operator === 'equals' && payloadValue !== value) return false;
          if (operator === 'not_equals' && payloadValue === value) return false;
          if (operator === 'exists' && (payloadValue === undefined || payloadValue === null)) return false;
        }
        return true;
      });

      if (conditionsMatch) {
        await step.run(`execute-action-${workflow.id}`, async () => {
          const actionPayload = typeof workflow.action_payload === 'string' ? JSON.parse(workflow.action_payload) : workflow.action_payload;
          
          console.log(`[Automation] Executing workflow ${workflow.id} for tenant ${tenantId}`);
          
          if (workflow.action_type === 'SEND_EMAIL') {
            console.log(`📧 Simulated Email Sent to ${payload[actionPayload.to_field]} using template ${actionPayload.template}`);
          } else if (workflow.action_type === 'WEBHOOK') {
            console.log(`🌐 Simulated Webhook fired to ${actionPayload.url}`);
          }
        });
        processedCount++;
      }
    }

    return { success: true, processed: processedCount };
  }
);

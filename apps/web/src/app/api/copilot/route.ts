import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';

export const dynamic = 'force-dynamic';

const COPILOT_ROLES = [
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'ACCOUNTANT',
  'ADMISSION_COUNSELOR',
  'TEACHER',
] as const;

const CopilotRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
});

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth(COPILOT_ROLES);
    if (auth.ok === false) return auth.response;

    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Copilot provider is not configured' }, { status: 503 });
    }

    const json = await readTenantScopedJson(req, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = CopilotRequestSchema.safeParse(json.data);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid prompt' }, { status: 400 });
    }

    const cerebras = createOpenAI({
      apiKey,
      baseURL: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    });

    const tenantId = auth.context.tenantId;

    const schemaRes = await pool.query(
      `SELECT o.name as object_name, json_agg(f.name) as fields
       FROM metadata_objects o
       LEFT JOIN metadata_fields f ON f.object_id = o.id
       WHERE o.tenant_id = $1
       GROUP BY o.id, o.name`,
      [tenantId]
    );

    // Build the dynamic LLM context string
    let schemaContext = 'Available Objects:\n';
    if (schemaRes.rowCount > 0) {
      schemaRes.rows.forEach(row => {
        schemaContext += `- '${row.object_name}' (Fields: ${row.fields ? row.fields.join(', ') : 'none'})\n`;
      });
    } else {
      schemaContext += 'No custom objects defined yet.\n';
    }

    const systemPrompt = `You are an intelligent Copilot for School SIS, an enterprise vertical OS for education.
You are tasked with helping administrators generate reports and insights based strictly on their custom data model. 
Translate the user's natural language request into a structured JSON configuration that our Custom Report Builder can understand.

${schemaContext}`;

    const result = await streamText({
      model: cerebras('llama3.1-8b'),
      system: systemPrompt,
      prompt: parsed.data.prompt,
      tools: {
        generateReportAst: tool({
          description: 'Generates a structured Abstract Syntax Tree (AST) for the Report Builder',
          inputSchema: z.object({
            baseObject: z.string().describe('The primary metadata object to query (e.g. students, fees, attendance)'),
            chartType: z.enum(['BAR', 'PIE', 'LINE', 'DATATABLE']).describe('The recommended visualization format'),
            aggregations: z.array(z.object({
              function: z.enum(['COUNT', 'SUM', 'AVG']),
              field: z.string()
            })).optional(),
            filters: z.array(z.object({
              field: z.string(),
              operator: z.enum(['=', '>', '<', '>=', '<=', '!=', 'ILIKE']),
              value: z.string()
            })).optional()
          }),
          execute: async (config) => {
            return {
              success: true,
              message: 'Report AST generated successfully. This JSON configuration will be passed to the Recharts frontend component.',
              configuration: config
            };
          }
        })
      }
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Error in Copilot API:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

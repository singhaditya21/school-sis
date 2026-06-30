import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';

// Initialize the Cerebras provider (OpenAI-compatible) for ultra-fast, cheap Llama 3 inference
const cerebras = createOpenAI({
  apiKey: 'csk-vfrek62k49v6c6eytt2tn6e6mvt9t95c2hfrwd2vvdw4e2ff',
  baseURL: 'https://api.cerebras.ai/v1',
});

export async function POST(req: Request) {
  try {
    const { prompt, tenantId } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Dynamically query the tenant's exact metadata schema from Postgres
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
      prompt: prompt,
      tools: {
        generateReportAst: tool({
          description: 'Generates a structured Abstract Syntax Tree (AST) for the Report Builder',
          parameters: z.object({
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
            // In a real execution, we would save this to the `metadata_reports` table here.
            console.log('Generated Report Configuration:', config);
            return {
              success: true,
              message: 'Report AST generated successfully. This JSON configuration will be passed to the Recharts frontend component.',
              configuration: config
            };
          }
        })
      }
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Error in Copilot API:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

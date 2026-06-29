import { openai } from '@ai-sdk/openai';
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

// This is the core engine for the AI Copilot that integrates deeply with our Metadata Engine.
// It exposes tools to the LLM allowing it to parse natural language into structured AST/JSON for our Custom Reports.

export async function POST(req: Request) {
  try {
    const { prompt, tenantId } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // In a production environment, we would query the `metadata_objects` and `metadata_fields` 
    // tables here for this specific tenantId to build the context schema.
    const systemPrompt = `You are an intelligent Copilot for School SIS, an enterprise vertical OS for education.
You are tasked with helping administrators generate reports and insights. 
Translate the user's natural language request into a structured JSON configuration that our Custom Report Builder can understand.

Available Objects: 
- 'students' (Fields: id, first_name, last_name, enrollment_date, status)
- 'fees' (Fields: id, student_id, amount, status, due_date)
- 'attendance' (Fields: id, student_id, date, status)
`;

    const result = await streamText({
      model: openai('gpt-4o'),
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

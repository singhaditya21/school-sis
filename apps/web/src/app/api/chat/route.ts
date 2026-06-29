import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// Connect to our local Rust inference engine using the OpenAI compatibility layer
const localInference = createOpenAI({
  baseURL: 'http://localhost:8000/v1',
  apiKey: 'dummy-key-for-local', // local rust inference doesn't need an API key
});

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireAuth();
    const { messages } = await req.json();

    // Extract the user's latest question
    const latestMessage = messages[messages.length - 1];
    const userQuery = latestMessage.content;

    // 1. Generate an embedding for the user's query
    // Mocking the vector generation for the local environment setup
    const queryVector = Array.from({ length: 768 }, () => Math.random() - 0.5);

    // 2. Perform a similarity search in our centralized pgvector search_index table
    const searchSql = `
      SELECT entity_type, entity_id, content, metadata,
             1 - (embedding <=> $1::vector) AS similarity
      FROM search_index
      WHERE tenant_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT 5
    `;
    const { rows: contextRows } = await pool.query(searchSql, [JSON.stringify(queryVector), tenantId]);

    // 3. Construct the RAG context string
    const systemPrompt = `
      You are the universal AI Copilot for the School SIS system.
      Use the following database records to answer the user's question accurately.
      If the answer is not contained in the context, politely state that you cannot find the information.
      
      CONTEXT:
      ${contextRows.map(row => `---
      Type: ${row.entity_type} (ID: ${row.entity_id})
      Data: ${row.content}
      `).join('\\n')}
    `;

    // 4. Stream the text response back to the widget using Vercel AI SDK
    const result = await streamText({
      model: localInference('meta-llama/Llama-3-8b-instruct'),
      system: systemPrompt,
      messages,
    });

    return result.toDataStreamResponse();
  } catch (error: any) {
    console.error("AI Chat Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

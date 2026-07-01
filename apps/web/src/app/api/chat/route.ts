import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import { agentUnavailableResponse, forwardAgentRequest } from '@/lib/agents/client';

export const dynamic = 'force-dynamic';

const MessageSchema = z.object({
  role: z.string(),
  content: z.string().optional(),
  parts: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
  })).optional(),
});

const ChatSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
});

function latestUserText(messages: z.infer<typeof ChatSchema>['messages']): string {
  const latest = [...messages].reverse().find((message) => message.role === 'user') || messages[messages.length - 1];
  if (latest.content) return latest.content;
  return latest.parts
    ?.filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('\n')
    .trim() || '';
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth([
      'PLATFORM_ADMIN',
      'SUPER_ADMIN',
      'SCHOOL_ADMIN',
      'PRINCIPAL',
      'ACCOUNTANT',
      'ADMISSION_COUNSELOR',
      'TEACHER',
    ]);
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(req, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = ChatSchema.safeParse(json.data);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid chat request' }, { status: 400 });
    }

    const query = latestUserText(parsed.data.messages);
    if (!query) {
      return NextResponse.json({ error: 'Missing chat message' }, { status: 400 });
    }

    return await forwardAgentRequest(auth.context, '/api/v1/agents/synthesis/query', {
      method: 'POST',
      body: {
        query,
        tenant_id: auth.context.tenantId,
        user_id: auth.context.userId,
      },
    });
  } catch (error) {
    return agentUnavailableResponse(error);
  }
}

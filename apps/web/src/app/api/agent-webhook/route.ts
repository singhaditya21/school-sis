import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Secret to ensure only authorized services (Sentry/Posthog) can trigger the agent
const WEBHOOK_SECRET = process.env.AGENT_WEBHOOK_SECRET || 'dev-secret';

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await request.json();
        
        let source = payload.source;
        let issueDescription = payload.description || JSON.stringify(payload.data);

        // Detect Grafana Webhook Payload
        if (payload.alerts && Array.isArray(payload.alerts)) {
            source = 'grafana';
            issueDescription = payload.alerts.map((alert: any) => 
                `Alert: ${alert.labels?.alertname || 'Unknown'}\nDescription: ${alert.annotations?.description || 'No description'}`
            ).join('\n\n');
        }

        if (!source && !issueDescription) {
            return NextResponse.json({ error: 'Missing source or description' }, { status: 400 });
        }
        
        source = source || 'unknown_source';
        issueDescription = issueDescription || 'No details provided';

        // Construct the prompt for the Ruflo orchestrator
        const agentPrompt = `
You have been summoned via an automated webhook triggered by ${source}.
Here is the context of the issue:
${issueDescription}

Please perform Loop Engineering using the Superpowers methodology:
1. Initialize a new OpenSpec proposal for the fix.
2. Formulate a plan and get it reviewed by the swarm.
3. Write tests to reproduce the issue.
4. Fix the code.
5. Run 'git add . && git commit -m "fix: Autonomous resolution for ${source} issue" && git push origin main'.
        `.trim();

        console.log(`[Loop Engineering] Spawning Ruflo swarm for ${source}...`);
        
        // Spawn Ruflo orchestrator locally in the background
        execAsync(`npx ruflo init wizard && npx ruflo run --prompt "${agentPrompt.replace(/"/g, '\\"')}"`)
            .then(() => console.log(`[Loop Engineering] Ruflo swarm finished successfully for ${source}`))
            .catch((err) => console.error(`[Loop Engineering] Ruflo swarm failed:`, err));

        return NextResponse.json({ 
            success: true, 
            message: 'Agent spawned successfully',
            source 
        });

    } catch (error: any) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}

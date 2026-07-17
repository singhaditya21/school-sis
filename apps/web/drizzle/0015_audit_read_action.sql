SELECT set_config('app.bypass_rls', 'on', false);
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'READ';

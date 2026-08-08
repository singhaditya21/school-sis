ALTER TABLE "users" ADD COLUMN "auth_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_change_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "temporary_password_expires_at" timestamp with time zone;--> statement-breakpoint
DO $$
DECLARE
	duplicate_group_count integer;
BEGIN
	SELECT COUNT(*)::integer
	INTO duplicate_group_count
	FROM (
		SELECT tenant_id, lower(email)
		FROM users
		GROUP BY tenant_id, lower(email)
		HAVING COUNT(*) > 1
	) duplicate_groups;

	IF duplicate_group_count > 0 THEN
		RAISE EXCEPTION USING
			MESSAGE = format(
				'Cannot enforce users_tenant_email_lower_key: found %s duplicate tenant/email group(s).',
				duplicate_group_count
			),
			HINT = 'Run SELECT tenant_id, lower(email), array_agg(id) FROM users GROUP BY tenant_id, lower(email) HAVING count(*) > 1; remediate each group, then rerun the migration.';
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_lower_key" ON "users" USING btree ("tenant_id",lower("email"));

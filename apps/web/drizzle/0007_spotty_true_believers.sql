CREATE TYPE "public"."institution_type" AS ENUM('K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'PLATFORM_ADMIN' BEFORE 'SUPER_ADMIN';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "institution_type" "institution_type" DEFAULT 'K12' NOT NULL;
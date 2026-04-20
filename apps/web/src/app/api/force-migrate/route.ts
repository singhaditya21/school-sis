import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";

export const dynamic = 'force-dynamic';

/**
 * Force-migrate endpoint — STRICTLY gated.
 *
 * SECURITY:
 * - Only accessible by authenticated PLATFORM_ADMIN
 * - Blocked entirely in production unless ALLOW_FORCE_MIGRATE=true
 * - Returns generic errors to prevent schema disclosure
 */

export async function GET() {
    // SECURITY: Require PLATFORM_ADMIN authentication
    const session = await getSession();
    if (!session.isLoggedIn || session.role !== 'PLATFORM_ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // SECURITY: Block in production unless explicitly allowed
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_FORCE_MIGRATE !== 'true') {
        return NextResponse.json(
            { error: 'Force migration is disabled in production. Set ALLOW_FORCE_MIGRATE=true to enable.' },
            { status: 403 }
        );
    }

    try {
        console.log("Starting forced migration (authenticated by", session.email, ")...");

        // 1. Add missing enum role if not exists
        try {
            await db.execute(sql`ALTER TYPE "public"."user_role" ADD VALUE 'PLATFORM_ADMIN' BEFORE 'SUPER_ADMIN';`);
        } catch(e: any) {
            console.log("Enum PLATFORM_ADMIN might already exist:", e.message);
        }

        // 2. Add missing fields to `companies`
        try {
            await db.execute(sql`ALTER TABLE "companies" ADD COLUMN "region" varchar(50) DEFAULT 'US-EAST' NOT NULL;`);
        } catch(e: any) { console.log(e.message); }

        try {
            await db.execute(sql`ALTER TABLE "companies" ADD COLUMN "domain_mask" varchar(255);`);
        } catch(e: any) { console.log(e.message); }

        try {
            await db.execute(sql`ALTER TABLE "companies" ADD COLUMN "theme_color" varchar(50) DEFAULT '#4F46E5';`);
        } catch(e: any) { console.log(e.message); }

        try { await db.execute(sql`ALTER TABLE "companies" ADD COLUMN "stripe_customer_id" varchar(255);`); } catch(e){}
        try { await db.execute(sql`ALTER TABLE "companies" ADD COLUMN "stripe_subscription_id" varchar(255);`); } catch(e){}
        try { await db.execute(sql`ALTER TABLE "companies" ADD COLUMN "stripe_price_id" varchar(255);`); } catch(e){}
        try { await db.execute(sql`ALTER TABLE "companies" ADD COLUMN "stripe_current_period_end" timestamp with time zone;`); } catch(e){}
        try { await db.execute(sql`ALTER TABLE "companies" ADD COLUMN "billing_status" varchar(50);`); } catch(e){}
        try { await db.execute(sql`ALTER TABLE "companies" ADD COLUMN "subscription_tier" varchar(50);`); } catch(e){}
        try { await db.execute(sql`ALTER TABLE "companies" ADD COLUMN "active_modules" text;`); } catch(e){}

        return NextResponse.json({ success: true, message: "Remote migration completed!" });

    } catch (error: any) {
        console.error('Fatal Migration Error:', error);
        return NextResponse.json({ success: false, error: 'Migration failed' }, { status: 500 });
    }
}

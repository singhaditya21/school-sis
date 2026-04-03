const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');

const sql = postgres(process.env.DATABASE_URL);
const db = drizzle(sql);

async function test() {
  try {
    const res = await sql`select "id", "name", "stripe_customer_id", "stripe_subscription_id", "stripe_price_id", "stripe_current_period_end", "billing_status", "subscription_tier", "active_modules", "region", "domain_mask", "theme_color", "is_active", "created_at", "updated_at" from "companies" where "companies"."name" = 'ScholarMind HQ'`;
    console.log('Query Success:', res);
  } catch (error) {
    console.error('Query Failed:', error.message);
  } finally {
    await sql.end();
  }
}

test();

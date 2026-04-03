const postgres = require('postgres');

const sql = postgres(process.env.DIRECT_URL);

async function check() {
  try {
    const companiesCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'companies'`;
    console.log('Companies columns:', companiesCols.map(c => c.column_name));
    
    const tenantsCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'tenants'`;
    console.log('Tenants columns:', tenantsCols.map(c => c.column_name));
  } catch (error) {
    console.error(error);
  } finally {
    await sql.end();
  }
}

check();

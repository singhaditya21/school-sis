import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

/**
 * Core Data Router for the No-Code Engine.
 * Dynamically handles CRUD operations for any custom object (e.g. /api/data/hostel_assignments)
 */
export async function GET(
  req: Request,
  { params }: { params: { object_name: string } }
) {
  try {
    const objectName = params.object_name;
    // TODO: In production, extract tenantId securely from the session via NextAuth
    const tenantId = '00000000-0000-0000-0000-000000000000'; 

    // 1. Validate the object exists for this tenant
    const objRes = await pool.query(
      `SELECT id FROM metadata_objects WHERE name = $1 AND tenant_id = $2`,
      [objectName, tenantId]
    );

    if (objRes.rowCount === 0) {
      return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
    }
    const objectId = objRes.rows[0].id;

    // 2. Fetch all records and their EAV values for this object
    const recordsRes = await pool.query(
      `SELECT r.id as record_id, f.name as field_name, v.value_string, v.value_number, v.value_boolean, v.value_date
       FROM metadata_records r
       JOIN metadata_values v ON v.record_id = r.id
       JOIN metadata_fields f ON v.field_id = f.id
       WHERE r.object_id = $1`,
      [objectId]
    );

    // Group EAV rows into clean JSON objects
    const dataMap = new Map();
    recordsRes.rows.forEach(row => {
      if (!dataMap.has(row.record_id)) {
        dataMap.set(row.record_id, { id: row.record_id });
      }
      const record = dataMap.get(row.record_id);
      // Coalesce the EAV value based on what is not null
      const value = row.value_string ?? row.value_number ?? row.value_boolean ?? row.value_date;
      record[row.field_name] = value;
    });

    return NextResponse.json({ data: Array.from(dataMap.values()) });
  } catch (error) {
    console.error('Dynamic Data GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { object_name: string } }
) {
  try {
    const objectName = params.object_name;
    const body = await req.json();
    const tenantId = '00000000-0000-0000-0000-000000000000'; // Replace with session.tenantId

    // 1. Validate object
    const objRes = await pool.query(
      `SELECT id FROM metadata_objects WHERE name = $1 AND tenant_id = $2`,
      [objectName, tenantId]
    );

    if (objRes.rowCount === 0) {
      return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
    }
    const objectId = objRes.rows[0].id;

    // 2. Begin Transaction to insert Record + Values
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create the record wrapper
      const recordRes = await client.query(
        `INSERT INTO metadata_records (id, object_id, created_at, updated_at) 
         VALUES (gen_random_uuid(), $1, NOW(), NOW()) RETURNING id`,
        [objectId]
      );
      const recordId = recordRes.rows[0].id;

      // Insert EAV values for each key in the JSON body
      for (const [key, value] of Object.entries(body)) {
        // Find the field ID and type
        const fieldRes = await client.query(
          `SELECT id, type FROM metadata_fields WHERE object_id = $1 AND name = $2`,
          [objectId, key]
        );
        
        if (fieldRes.rowCount > 0) {
          const field = fieldRes.rows[0];
          // Determine the correct EAV column based on field type
          let valCol = 'value_string';
          if (field.type === 'NUMBER' || field.type === 'CURRENCY') valCol = 'value_number';
          else if (field.type === 'BOOLEAN') valCol = 'value_boolean';
          else if (field.type === 'DATE') valCol = 'value_date';

          await client.query(
            `INSERT INTO metadata_values (id, record_id, field_id, ${valCol}) 
             VALUES (gen_random_uuid(), $1, $2, $3)`,
            [recordId, field.id, value]
          );
        }
      }

      await client.query('COMMIT');
      return NextResponse.json({ success: true, recordId }, { status: 201 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Dynamic Data POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

-- ---------------------------------------------------------------------------
-- Starter TENANT-DEFINED object: "Lost and Found Item".
--
-- This is the first object in the codebase that exists ONLY as metadata. It has
-- no migration, no table, no service, no page route and no server action of its
-- own. Rows live in metadata_records / metadata_values, and the generic engine
-- serves list / detail / create / edit at /app/lost_and_found_item.
--
-- It also carries a real field_permissions matrix so that field-level access
-- control is exercised, not just declared:
--
--   TEACHER   read+write  item_name, category, found_on, found_location, status
--   TEACHER   read-only   estimated_value, handed_over
--   TEACHER   no access   claimed_by_name
--   SCHOOL_ADMIN / SUPER_ADMIN / PLATFORM_ADMIN  full access (engine default)
--   every other role                             no access (engine default)
--
-- Idempotent: safe to re-run. Applied with
--   psql "$DATABASE_URL" -f packages/api/src/metadata/seed-lost-and-found-object.sql
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_tenant       RECORD;
    v_object_id    uuid;
BEGIN
    FOR v_tenant IN SELECT id FROM tenants WHERE is_active LOOP

        INSERT INTO metadata_objects (
            tenant_id, name, api_name, table_name, description, is_custom,
            status, version, published_version, published_at, created_at, updated_at
        )
        VALUES (
            v_tenant.id,
            'Lost and Found Item',
            'lost_and_found_item',
            'metadata_records',
            'Items handed in to the school office: what it is, where and when it turned up, and whether it went back to its owner.',
            true,
            'PUBLISHED', 1, 1, NOW(), NOW(), NOW()
        )
        ON CONFLICT (tenant_id, api_name) DO NOTHING;

        SELECT id INTO v_object_id
        FROM metadata_objects
        WHERE tenant_id = v_tenant.id
          AND api_name = 'lost_and_found_item';

        INSERT INTO metadata_fields (
            object_id, label, api_name, data_type, is_custom, is_required,
            picklist_options, validation_rules, status, version, created_at, updated_at
        )
        VALUES
            (v_object_id, 'Item',            'item_name',       'TEXT',     true, true,
             '[]'::jsonb, '{"minLength":2,"maxLength":120}'::jsonb, 'ACTIVE', 1, NOW(), NOW()),
            (v_object_id, 'Category',        'category',        'PICKLIST', true, true,
             '["Electronics","Clothing","Books","Stationery","Sports Equipment","Other"]'::jsonb,
             '{}'::jsonb, 'ACTIVE', 1, NOW(), NOW()),
            (v_object_id, 'Found On',        'found_on',        'DATE',     true, true,
             '[]'::jsonb, '{}'::jsonb, 'ACTIVE', 1, NOW(), NOW()),
            (v_object_id, 'Found At',        'found_location',  'TEXT',     true, true,
             '[]'::jsonb, '{"maxLength":160}'::jsonb, 'ACTIVE', 1, NOW(), NOW()),
            (v_object_id, 'Status',          'status',          'PICKLIST', true, true,
             '["Unclaimed","Claimed","Disposed"]'::jsonb, '{}'::jsonb, 'ACTIVE', 1, NOW(), NOW()),
            (v_object_id, 'Estimated Value', 'estimated_value', 'CURRENCY', true, false,
             '[]'::jsonb, '{"min":0,"max":1000000}'::jsonb, 'ACTIVE', 1, NOW(), NOW()),
            (v_object_id, 'Claimed By',      'claimed_by_name', 'TEXT',     true, false,
             '[]'::jsonb, '{"maxLength":160}'::jsonb, 'ACTIVE', 1, NOW(), NOW()),
            (v_object_id, 'Handed Over',     'handed_over',     'BOOLEAN',  true, false,
             '[]'::jsonb, '{}'::jsonb, 'ACTIVE', 1, NOW(), NOW())
        ON CONFLICT (object_id, api_name) DO NOTHING;

        -- Default layouts, so the generic surfaces render sensibly on first visit.
        IF NOT EXISTS (
            SELECT 1 FROM metadata_layouts WHERE object_id = v_object_id AND layout_type = 'LIST'
        ) THEN
            INSERT INTO metadata_layouts (object_id, layout_type, schema, is_default, created_at)
            VALUES (
                v_object_id, 'LIST',
                '{"columns":["item_name","category","found_on","found_location","status"]}'::jsonb,
                true, NOW()
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM metadata_layouts WHERE object_id = v_object_id AND layout_type = 'FORM'
        ) THEN
            INSERT INTO metadata_layouts (object_id, layout_type, schema, is_default, created_at)
            VALUES (
                v_object_id, 'FORM',
                '{"sections":[{"title":"Lost and Found Item","fields":["item_name","category","found_on","found_location","status","estimated_value","claimed_by_name","handed_over"]}]}'::jsonb,
                true, NOW()
            );
        END IF;

        -- Field-level permissions for TEACHER.
        INSERT INTO field_permissions (field_id, role, can_read, can_write)
        SELECT f.id, 'TEACHER', true, true
        FROM metadata_fields f
        WHERE f.object_id = v_object_id
          AND f.api_name IN ('item_name', 'category', 'found_on', 'found_location', 'status')
        ON CONFLICT (field_id, role)
        DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write;

        INSERT INTO field_permissions (field_id, role, can_read, can_write)
        SELECT f.id, 'TEACHER', true, false
        FROM metadata_fields f
        WHERE f.object_id = v_object_id
          AND f.api_name IN ('estimated_value', 'handed_over')
        ON CONFLICT (field_id, role)
        DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write;

        INSERT INTO field_permissions (field_id, role, can_read, can_write)
        SELECT f.id, 'TEACHER', false, false
        FROM metadata_fields f
        WHERE f.object_id = v_object_id
          AND f.api_name = 'claimed_by_name'
        ON CONFLICT (field_id, role)
        DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write;

        -- Record the published schema version, so the tenant-defined object has
        -- the same audit trail as one published through the Object Manager.
        INSERT INTO metadata_schema_versions (
            tenant_id, object_id, version, status, schema_snapshot, migration_plan, published_at
        )
        SELECT
            v_tenant.id,
            v_object_id,
            1,
            'PUBLISHED',
            jsonb_build_object(
                'object', to_jsonb(o.*),
                'fields', COALESCE(jsonb_agg(to_jsonb(f.*) ORDER BY f.created_at) FILTER (WHERE f.id IS NOT NULL), '[]'::jsonb)
            ),
            '{"operation":"CREATE_CUSTOM_OBJECT","storage":"metadata_records_eav","physicalDdlRequired":false}'::jsonb,
            NOW()
        FROM metadata_objects o
        LEFT JOIN metadata_fields f ON f.object_id = o.id
        WHERE o.id = v_object_id
        GROUP BY o.id, o.*
        ON CONFLICT (object_id, version) DO NOTHING;

    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Two sample rows, so the generated list/detail surfaces have something to
-- show on a fresh environment. Skipped entirely once the object holds records.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_tenant     RECORD;
    v_object_id  uuid;
    v_record_id  uuid;
    v_sample     jsonb;
    v_row        jsonb;
BEGIN
    v_sample := '[
      {"item_name":"Navy School Blazer (Size 12)","category":"Clothing","found_on":"2026-08-11","found_location":"Assembly Hall","status":"Unclaimed","estimated_value":1800,"handed_over":false},
      {"item_name":"Casio Scientific Calculator","category":"Electronics","found_on":"2026-08-18","found_location":"Physics Lab 2","status":"Claimed","estimated_value":1250,"claimed_by_name":"Ananya Singh","handed_over":true}
    ]'::jsonb;

    FOR v_tenant IN SELECT id FROM tenants WHERE is_active LOOP
        SELECT id INTO v_object_id
        FROM metadata_objects
        WHERE tenant_id = v_tenant.id AND api_name = 'lost_and_found_item';

        CONTINUE WHEN v_object_id IS NULL;
        CONTINUE WHEN EXISTS (SELECT 1 FROM metadata_records WHERE object_id = v_object_id);

        FOR v_row IN SELECT * FROM jsonb_array_elements(v_sample) LOOP
            INSERT INTO metadata_records (tenant_id, object_id, created_at, updated_at)
            VALUES (v_tenant.id, v_object_id, NOW(), NOW())
            RETURNING id INTO v_record_id;

            INSERT INTO metadata_values (record_id, field_id, value_string, value_number, value_boolean, value_date)
            SELECT
                v_record_id,
                f.id,
                CASE WHEN f.data_type IN ('TEXT','PICKLIST') THEN v_row ->> f.api_name END,
                CASE WHEN f.data_type IN ('NUMBER','CURRENCY') THEN (v_row ->> f.api_name)::numeric END,
                CASE WHEN f.data_type = 'BOOLEAN' THEN (v_row ->> f.api_name)::boolean END,
                CASE WHEN f.data_type = 'DATE' THEN (v_row ->> f.api_name)::date END
            FROM metadata_fields f
            WHERE f.object_id = v_object_id
              AND f.status = 'ACTIVE'
              AND v_row ? f.api_name;
        END LOOP;
    END LOOP;
END $$;

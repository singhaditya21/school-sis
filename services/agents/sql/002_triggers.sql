-- ScholarMind Real-Time Indexing Triggers
-- Sends notifications on changes to critical tables so the Python Agent service can update pgvector
-- Run against the existing school_sis database

CREATE OR REPLACE FUNCTION notify_entity_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
BEGIN
    -- Construct a JSON payload depending on the table
    IF TG_TABLE_NAME = 'students' THEN
        payload = json_build_object(
            'type', 'student',
            'id', NEW.id,
            'tenant_id', NEW.tenant_id
        );
    ELSIF TG_TABLE_NAME = 'invoices' THEN
        payload = json_build_object(
            'type', 'invoice',
            'id', NEW.id,
            'tenant_id', NEW.tenant_id
        );
    -- Future: attendance_records, etc if deemed necessary for immediate indexing
    ELSE
        RETURN NEW;
    END IF;

    -- Send NOTIFY on channel "entity_changes"
    PERFORM pg_notify('entity_changes', payload::text);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- Triggers
-- ────────────────────────────────────────────────────────────

-- 1. Students Trigger
DROP TRIGGER IF EXISTS trg_student_changes ON students CASCADE;
CREATE TRIGGER trg_student_changes
AFTER INSERT OR UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION notify_entity_change();

-- 2. Invoices Trigger (important for FeeAgent real-time awareness)
DROP TRIGGER IF EXISTS trg_invoice_changes ON invoices CASCADE;
CREATE TRIGGER trg_invoice_changes
AFTER INSERT OR UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION notify_entity_change();

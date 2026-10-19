import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readWebSource(relativePath: string): string {
    return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('LCNC & Drag-and-Drop Platform Builders', () => {
    it('exposes saveObjectLayout, updateFieldPermissions, updateRecordFieldValue, and live workflow action runners in metadata-engine.ts', () => {
        const source = readWebSource('src/lib/actions/metadata-engine.ts');
        expect(source).toContain('export async function saveObjectLayout');
        expect(source).toContain('export async function updateFieldPermissions');
        expect(source).toContain('export async function updateRecordFieldValue');
        expect(source).toContain('export async function runSingleWorkflowAction');
        expect(source).toContain('async function executeMatchingWorkflows');
        expect(source).toContain("runner: 'FIELD_UPDATE'");
        expect(source).toContain("runner: 'CREATE_TASK'");
        expect(source).toContain("runner: 'SEND_EMAIL'");
        expect(source).toContain("runner: 'WEBHOOK'");
        expect(source).toContain('INSERT INTO notification_outbox');
        expect(source).toContain('INSERT INTO appointments');
        expect(source).toContain('INSERT INTO background_jobs');
        expect(source).toContain("INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, after_state)");
        expect(source).toContain("'WORKFLOW_EXECUTED'");

        const automationActions = readWebSource('src/lib/actions/automation.ts');
        expect(automationActions).toContain('export async function getWorkflowExecutions');
        expect(automationActions).toContain('export async function triggerWorkflowTestRun');
    });

    it('provides a Drag-and-Drop Form and List Layout Designer for metadata objects', () => {
        const layoutBuilder = readWebSource('src/app/(admin)/settings/objects/[id]/layout-builder.tsx');
        expect(layoutBuilder).toContain('draggable');
        expect(layoutBuilder).toContain('onDragStart');
        expect(layoutBuilder).toContain('onDrop');
        expect(layoutBuilder).toContain('saveObjectLayout');

        const objectPage = readWebSource('src/app/(admin)/settings/objects/[id]/page.tsx');
        expect(objectPage).toContain('ObjectLayoutBuilderClient');
    });

    it('provides an interactive Field-Level Security (FLS) role matrix in FieldManagerClient', () => {
        const fieldManager = readWebSource('src/app/(admin)/settings/objects/[id]/field-manager.tsx');
        expect(fieldManager).toContain('updateFieldPermissions');
        expect(fieldManager).toContain('FLS Matrix');
        expect(fieldManager).toContain('Save Role Permissions');
    });

    it('supports drag-and-drop Kanban boards in Admissions and Generic Metadata Objects', () => {
        const admissionsBoard = readWebSource('src/app/(admin)/admissions/admissions-pipeline-board.tsx');
        expect(admissionsBoard).toContain('draggable');
        expect(admissionsBoard).toContain('onDragOver');
        expect(admissionsBoard).toContain('onDrop');

        const genericList = readWebSource('src/app/(admin)/app/[object]/generic-list.tsx');
        expect(genericList).toContain('toggle-kanban-view');
        expect(genericList).toContain('updateRecordFieldValue');
        expect(genericList).toContain('draggable');
    });

    it('provides a visual drag-and-drop node canvas for Workflow Automation and interactive Data Studio', () => {
        const workflowBuilder = readWebSource('src/components/automation/workflow-builder.tsx');
        expect(workflowBuilder).toContain('workflow-visual-canvas');
        expect(workflowBuilder).toContain('draggable');
        expect(workflowBuilder).toContain('onDrop={handleCanvasDrop}');

        const dataStudio = readWebSource('src/app/(dashboard)/data/data-studio-client.tsx');
        expect(dataStudio).toContain('handleColumnDrop');
        expect(dataStudio).toContain('handleInlineCellCommit');
        expect(dataStudio).toContain('saveObjectLayout');
    });
});

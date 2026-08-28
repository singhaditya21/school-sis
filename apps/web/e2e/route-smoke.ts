import { expect, test, type Browser, type Page, type Response } from '@playwright/test';
import { hash } from 'bcryptjs';
import { authenticator } from 'otplib';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    getPageAccessPolicy,
    isRoleAllowedForPage,
} from '../src/lib/auth/page-access';

/**
 * ROUTE SMOKE LAYER (D13)
 * ───────────────────────
 * The unit suite is large but almost entirely architectural: it asserts that
 * policies exist, that files are shaped correctly, that guards are wired. None
 * of it renders a page. That is how `/executive` shipped a SUM over a column
 * that did not exist — every gate was green and the page 500'd on first load.
 *
 * This layer closes that hole. It signs in against the seeded database and
 * actually loads the routes that matter, asserting three things per route:
 *
 *   1. the document returned HTTP 200 (not 500, not a bounce to /login),
 *   2. the rendered HTML is not Next's server-exception boundary,
 *   3. content that could only come from a working query is on the page.
 *
 * It is registered from `smoke.spec.ts` on purpose. `test:e2e:smoke` — the only
 * Playwright command wired into pull requests — runs `e2e/smoke.spec.ts` and
 * nothing else. A separate spec file here would never execute on a PR.
 *
 * Speed: each role signs in ONCE in `beforeAll` and the group reuses a single
 * page. A gate that takes minutes gets switched off.
 */

const SCHOOL_CODE = 'GREENWOOD';

/**
 * WHY THIS FILE PROVISIONS ITS OWN USERS
 * ──────────────────────────────────────
 * Playwright runs the PRODUCTION build, and `isMfaEnrollmentEnforced()` is true
 * whenever NODE_ENV === 'production'. Every seeded finance-capable account —
 * SUPER_ADMIN, PRINCIPAL, ACCOUNTANT — is in MFA_REQUIRED_ROLES, so password
 * login for them fails with "MFA enrollment is required for this account before
 * login." There is no seeded, non-MFA account that can reach /fees or /exams.
 *
 * Rather than weaken the MFA gate (it is correct) or bake a TOTP secret into a
 * smoke test, the layer creates three least-privilege staff accounts whose roles
 * are NOT in MFA_REQUIRED_ROLES and whose grants in policy.ts cover exactly the
 * routes each group visits. Splitting by role is a feature, not a workaround:
 * it means a permission regression on any of these routes fails the gate.
 */
interface SmokeUser {
    email: string;
    role: string;
    firstName: string;
    lastName: string;
    /** Routes this role is provisioned to reach, for the failure message. */
    covers: string;
}

const FINANCE_USER: SmokeUser = {
    email: 'smoke.finance@greenwood.edu',
    role: 'FINANCE_LEAD',
    firstName: 'Smoke',
    lastName: 'Finance',
    covers: '/fees, /fees/plans, /invoices, /invoices/[id], /executive',
};

const REGISTRY_USER: SmokeUser = {
    email: 'smoke.registrar@greenwood.edu',
    role: 'REGISTRAR',
    firstName: 'Smoke',
    lastName: 'Registrar',
    covers: '/students, /admissions, /exams',
};

const WELFARE_USER: SmokeUser = {
    email: 'smoke.counsellor@greenwood.edu',
    role: 'STUDENT_SUCCESS_COUNSELOR',
    firstName: 'Smoke',
    lastName: 'Counsellor',
    covers: '/attendance',
};

/** Seeded guardian of the first seeded student, Aarav Sharma (scripts/seed.ts). */
const PARENT_EMAIL = 'parent.aarav.sharma@gmail.com';

/** Next.js renders this when a server component throws. It is the failure we are hunting. */
const SERVER_EXCEPTION = /Application error: a server-side exception has occurred/i;

/**
 * Every page here is server-rendered: its content is in the first response or
 * it is not there at all, so waiting the config's 30s default buys nothing and
 * a fully-red run would stack those waits past CI's 15-minute step budget.
 */
const check = expect.configure({ timeout: 10_000 });

/** Rupee amounts render through formatCurrency (en-IN, INR) — e.g. "₹1,23,456". */
const RUPEES = /₹\s?[\d,]+/;

/**
 * A rupee amount that is not zero.
 *
 * This distinction is the whole point of the layer. When the request-scoped
 * tenant context stopped reaching the pool, FORCE RLS answered every read with
 * no rows and the fee screens rendered a clean, confident ₹0 — HTTP 200, no
 * exception, every label present. `RUPEES` alone matched "₹0" and passed.
 */
const NON_ZERO_RUPEES = /₹\s?[1-9][\d,]*/;

/**
 * Figures the seed makes deterministic, so a broken aggregate cannot pass.
 * scripts/seed.ts bills 10 students ₹15,000 each; e2e/fixtures/e2e-seed.sql adds
 * Aarav Sharma's ₹45,000 pending and ₹10,000 paid invoices.
 *   billed    = 10 × 15,000 + 45,000 + 10,000 = ₹2,05,000
 *   collected =  6 × 15,000 + 2 × 7,500 + 10,000 = ₹1,15,000
 */
const SEEDED_TOTAL_BILLED = '₹2,05,000';
const SEEDED_TOTAL_COLLECTED = '₹1,15,000';

function seedPassword(): string {
    const password = process.env.SEED_USER_PASSWORD;
    if (!password) {
        throw new Error(
            'SEED_USER_PASSWORD is not set. playwright.config.ts calls ' +
                'ensurePlaywrightTestEnvironment(), which always defines it — running this ' +
                'spec outside the Playwright config is not supported.',
        );
    }
    return password;
}

let provisioning: Promise<void> | null = null;

/** Provision once per worker, however many groups ask for it. */
function provisionSmokeUsers(): Promise<void> {
    provisioning ??= provisionSmokeUsersOnce();
    return provisioning;
}

/**
 * Create the three staff accounts, as the database owner so RLS does not hide
 * the tenant lookup. Idempotent — a retry re-creates the same row.
 */
async function provisionSmokeUsersOnce(): Promise<void> {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('Neither DIRECT_URL nor DATABASE_URL is set for the smoke fixtures.');
    }

    const client = new Client({ connectionString });
    await client.connect();
    try {
        const { rows } = await client.query<{ id: string }>(
            'SELECT id FROM tenants WHERE code = $1 LIMIT 1',
            [SCHOOL_CODE],
        );
        const tenantId = rows[0]?.id;
        if (!tenantId) {
            throw new Error(`Tenant ${SCHOOL_CODE} is missing — the database was not seeded.`);
        }

        const passwordHash = await hash(seedPassword(), 10);

        for (const user of [FINANCE_USER, REGISTRY_USER, WELFARE_USER]) {
            // Delete-then-insert rather than ON CONFLICT: the unique index is on
            // the expression (tenant_id, lower(email::text)), which is awkward to
            // name as a conflict target and would break if it were ever renamed.
            await client.query('DELETE FROM users WHERE tenant_id = $1 AND lower(email) = lower($2)', [
                tenantId,
                user.email,
            ]);
            await client.query(
                `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active, mfa_enabled)
                 VALUES ($1, $2, $3, $4, $5, $6::user_role, true, false)`,
                [tenantId, user.email, passwordHash, user.firstName, user.lastName, user.role],
            );
        }
    } finally {
        await client.end();
    }
}

async function signIn(page: Page, email: string, landingPath: string, covers?: string): Promise<void> {
    await page.goto('/login');
    await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible' });
    await page.fill('#schoolCode', SCHOOL_CODE);
    await page.fill('[data-testid="email-input"]', email);
    await page.fill('[data-testid="password-input"]', seedPassword());
    await page.click('[data-testid="login-button"]');

    // If sign-in fails the page stays put and renders login-error. Surface that
    // message instead of letting every route below fail as an unexplained bounce.
    await Promise.race([
        page.waitForURL(`**${landingPath}`, { timeout: 30_000 }),
        page
            .locator('[data-testid="login-error"]')
            .waitFor({ state: 'visible', timeout: 30_000 })
            .then(async () => {
                const message = (await page.locator('[data-testid="login-error"]').innerText()).trim();
                throw new Error(
                    `Sign-in failed for ${email}${covers ? ` (covers ${covers})` : ''}: ${message}`,
                );
            }),
    ]);
}

/**
 * Load `path` and prove the server actually rendered it.
 *
 * Every check here is a defect class this product has actually shipped: a 500
 * from a bad query, a silent bounce to /login or /unauthorized when a guard is
 * misconfigured, and an error boundary swallowing the exception behind a 200.
 */
async function visit(page: Page, path: string): Promise<Response> {
    const response = await page.goto(path);
    check(response, `${path} returned no document response`).not.toBeNull();

    check(
        response!.status(),
        `${path} should render for an authorised session, got HTTP ${response!.status()}`,
    ).toBe(200);

    const landedOn = new URL(page.url()).pathname;
    check(landedOn, `${path} bounced to ${landedOn} — the session was not authorised`).not.toMatch(
        /^\/(login|unauthorized)/,
    );

    await check(
        page.locator('body'),
        `${path} rendered Next's server-exception boundary`,
    ).not.toContainText(SERVER_EXCEPTION);

    return response!;
}

export function registerRouteSmokeTests(): void {
    // ─────────────────────────────────────────────────────────────────────
    // The fee spine. Money is the part of this product a school notices
    // breaking within the hour, so it is checked first and hardest.
    // ─────────────────────────────────────────────────────────────────────
    test.describe('Route smoke — fee spine', () => {
        // Deliberately NOT serial: a smoke gate should report every broken route
        // in one run, not stop at the first. The shared page is safe because the
        // config pins fullyParallel:false with a single worker.

        let page: Page;

        test.beforeAll(async ({ browser }: { browser: Browser }) => {
            await provisionSmokeUsers();
            page = await browser.newPage();
            await signIn(page, FINANCE_USER.email, '/dashboard', FINANCE_USER.covers);
        });

        test.afterAll(async () => {
            await page?.close();
        });

        test('/fees renders collection totals from real invoices', async () => {
            await visit(page, '/fees');

            await check(page.getByRole('heading', { name: 'Fee Management', level: 1 })).toBeVisible();

            // The workspace prices itself from the seeded plan's components.
            await check(page.getByText('Standard Fee Plan 2025-26').first()).toBeVisible();

            // Labels alone would pass over an all-zero page, which is exactly what
            // a lost tenant context produces. Require a real amount.
            await check(page.getByText(NON_ZERO_RUPEES).first()).toBeVisible();
        });

        test('/fees/plans lists the seeded plan with its billed total', async () => {
            await visit(page, '/fees/plans');

            await check(page.getByRole('heading', { name: 'Fee plans', level: 1 })).toBeVisible();
            await check(page.getByText('No fee plans yet. Create one to start invoicing.')).toHaveCount(0);

            const plan = page
                .locator('[data-testid="fee-plan-row"]')
                .filter({ hasText: 'Standard Fee Plan 2025-26' });
            await check(plan).toHaveCount(1);

            // Mandatory: tuition 5,000 + library 1,000 + lab 1,500 + annual 3,000.
            // Transport (2,000) is optional and must stay out of the billed total —
            // getFeePlanSummaries splitting these wrongly is a real overcharge.
            await check(plan).toContainText('₹10,500');
            await check(plan).toContainText('₹2,000');
        });

        test('/invoices lists seeded invoices with balances', async () => {
            await visit(page, '/invoices');

            await check(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
            await check(page.locator('[data-testid="filter-pending"]')).toBeVisible();

            const rows = page.locator('[data-testid="invoice-row"]');
            await check(rows.first()).toBeVisible();
            await check(rows.first()).toContainText(/INV-\d{4}-\d+/);

            // The header counts the whole result set, not the page. Zero here is
            // the empty-render failure this layer exists to catch.
            await check(page.getByText(/[1-9]\d* invoices?/).first()).toBeVisible();

            // Pin one seeded invoice end to end: its number, the students join that
            // supplies the name, the amount, and the status badge. Twelve invoices
            // fit inside the 25-row page, so no pagination is involved.
            const pending = rows.filter({ hasText: 'INV-2026-001' });
            await check(pending).toHaveCount(1);
            await check(pending).toContainText('Aarav Sharma');
            await check(pending).toContainText('₹45,000');
            await check(pending).toContainText('PENDING');
        });

        test('/invoices/[id] opens a real invoice with its payment surfaces', async () => {
            await visit(page, '/invoices');

            // A specific invoice rather than "the first row": INV-2025-089 is the
            // fully-settled fixture invoice, so it exercises the payment and receipt
            // joins that an unpaid invoice would leave empty.
            const invoiceLink = page
                .locator('[data-testid="invoice-row"]')
                .filter({ hasText: 'INV-2025-089' })
                .locator('a')
                .first();
            // Assert before reading: on an empty table innerText() would otherwise
            // burn the full 30s action timeout instead of failing here.
            await check(invoiceLink).toBeVisible();
            const invoiceNumber = (await invoiceLink.innerText()).trim();
            const href = await invoiceLink.getAttribute('href');
            check(href, 'invoice rows must link to their detail page').toMatch(
                /^\/invoices\/[0-9a-f-]{36}$/,
            );

            await visit(page, href!);

            await check(page.getByRole('heading', { name: invoiceNumber, level: 1 })).toBeVisible();

            // Total / Paid / Balance are three separate reads; all three must render.
            for (const label of ['Total billed', 'Paid', 'Balance due']) {
                await check(page.getByText(label, { exact: true }).first()).toBeVisible();
            }

            // ₹10,000 billed and ₹10,000 paid. Asserting the figure — not just the
            // label — is what separates a working aggregate from a rendered zero.
            await check(page.getByText('₹10,000').first()).toBeVisible();

            // The counter-payment workflow and its two supporting queries.
            await check(page.getByText('Record a payment')).toBeVisible();
            await check(page.getByText('Fee breakdown')).toBeVisible();
            await check(page.getByText('Payment history')).toBeVisible();

            // The fixture records exactly one payment against this invoice; the
            // header counts what the payments join actually returned.
            await check(page.getByText('1 recorded')).toBeVisible();
        });

        test('/executive renders the board fee position', async () => {
            // This exact page shipped a SUM over a non-existent column and 500'd
            // on load with the whole suite green. This case is why D13 exists.
            await visit(page, '/executive');

            await check(page.getByText('Executive Overview')).toBeVisible();

            for (const label of ['Total Billed', 'Total Collected', 'Outstanding']) {
                await check(page.getByText(label, { exact: true }).first()).toBeVisible();
            }

            // Each metric is formatCurrency() over an aggregate the page just ran.
            check(
                await page.getByText(RUPEES).count(),
                'expected billed, collected and outstanding to render as currency',
            ).toBeGreaterThanOrEqual(3);

            // The two figures the board reads. This page once shipped a SUM over a
            // column that did not exist; later it rendered ₹0 for everything because
            // RLS had nothing to sum. Both failures pass a label-only assertion, so
            // pin the arithmetic itself.
            await check(page.getByText(SEEDED_TOTAL_BILLED).first()).toBeVisible();
            await check(page.getByText(SEEDED_TOTAL_COLLECTED).first()).toBeVisible();

            await check(page.getByText(/\d+(\.\d+)?% collection rate/)).toBeVisible();
            await check(page.getByText('Overdue Balance')).toBeVisible();
            await check(page.getByText('Students With Dues')).toBeVisible();
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // Enrollment, admissions and exams — one registrar session.
    // ─────────────────────────────────────────────────────────────────────
    test.describe('Route smoke — enrollment and academics', () => {
        // Deliberately NOT serial: a smoke gate should report every broken route
        // in one run, not stop at the first. The shared page is safe because the
        // config pins fullyParallel:false with a single worker.

        let page: Page;

        test.beforeAll(async ({ browser }: { browser: Browser }) => {
            await provisionSmokeUsers();
            page = await browser.newPage();
            await signIn(page, REGISTRY_USER.email, '/dashboard', REGISTRY_USER.covers);
        });

        test.afterAll(async () => {
            await page?.close();
        });

        test('/students lists seeded students with admission numbers', async () => {
            await visit(page, '/students');

            await check(page.getByRole('heading', { name: 'Student Directory', level: 1 })).toBeVisible();
            await check(page.getByRole('columnheader', { name: 'Admission No.' })).toBeVisible();

            // The empty state is a legitimate render but a false pass here: the
            // seed has 20 students, so seeing it means the query silently failed.
            await check(page.getByText('No students found')).toHaveCount(0);

            // Seeded admission numbers are GWD2025NNNNN (apps/web/scripts/seed.ts).
            // The page swallows query errors into that same empty state, so the
            // admission number is the only proof the SELECT actually returned rows.
            await check(page.getByText('GWD202500001')).toBeVisible();
            await check(page.getByText('Aarav Sharma')).toBeVisible();
        });

        test('/admissions renders the pipeline and its conversion analytics', async () => {
            await visit(page, '/admissions');

            await check(page.getByRole('heading', { name: 'Admissions Pipeline', level: 1 })).toBeVisible();
            await check(page.getByRole('heading', { name: 'Conversion' })).toBeVisible();
            await check(page.getByRole('heading', { name: 'Where leads come from' })).toBeVisible();

            // Headings alone render perfectly over an empty pipeline. The seed
            // records three leads, so name one and refuse the empty breakdown.
            await check(page.getByText('No leads recorded yet.')).toHaveCount(0);
            await check(page.getByText('Aryan Khanna').first()).toBeVisible();
        });

        test('/exams renders the gradebook workspace', async () => {
            await visit(page, '/exams');

            await check(page.getByRole('heading', { name: 'Exams & Gradebook', level: 1 })).toBeVisible();
            await check(page.getByRole('heading', { name: 'All exams' })).toBeVisible();
            await check(page.getByRole('link', { name: 'Verify marks' })).toBeVisible();
            await check(page.getByRole('link', { name: 'Report cards' })).toBeVisible();

            // Same trap as /admissions: the workspace chrome renders with no exams
            // at all. e2e/fixtures/e2e-seed.sql creates exactly this one.
            await check(page.getByText('No exams created yet')).toHaveCount(0);
            await check(page.getByText('Mathematics Final').first()).toBeVisible();
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // Attendance — the only tenant-wide register view.
    // ─────────────────────────────────────────────────────────────────────
    test.describe('Route smoke — attendance', () => {
        // Deliberately NOT serial: a smoke gate should report every broken route
        // in one run, not stop at the first. The shared page is safe because the
        // config pins fullyParallel:false with a single worker.

        let page: Page;

        test.beforeAll(async ({ browser }: { browser: Browser }) => {
            await provisionSmokeUsers();
            page = await browser.newPage();
            await signIn(page, WELFARE_USER.email, '/dashboard', WELFARE_USER.covers);
        });

        test.afterAll(async () => {
            await page?.close();
        });

        test('/attendance renders today’s register summary', async () => {
            await visit(page, '/attendance');

            await check(page.getByRole('heading', { name: 'Attendance', level: 1 })).toBeVisible();

            for (const label of ['Total Students', 'Present Today', 'Absent Today', 'Sections Marked']) {
                await check(page.getByText(label, { exact: true })).toBeVisible();
            }
            await check(page.getByRole('heading', { name: 'Class-wise Attendance' })).toBeVisible();

            // Labels alone would pass over an empty result set. The seed enrols 20
            // students, so the headline count must be a real number, and the grid
            // must list the seeded grades.
            const totalStudents = page
                .getByText('Total Students', { exact: true })
                .locator('xpath=following-sibling::p[1]');
            await check(totalStudents).toHaveText(/^[1-9]\d*$/);
            await check(page.getByRole('heading', { name: /^Grade \d+$/ }).first()).toBeVisible();
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // Onboarding. The only route a prospective customer reaches before they
    // are a customer, and the one place where a broken query costs a signup
    // rather than an internal page view.
    // ─────────────────────────────────────────────────────────────────────
    test.describe('Route smoke — onboarding', () => {
        test('/setup provisions a workspace end to end', async ({ browser }: { browser: Browser }) => {
            const page = await browser.newPage();
            try {
                await visit(page, '/setup');

                // Unique per run: the action rejects a duplicate subdomain or email,
                // and rate-limits three attempts per value, so a fixed identifier
                // would fail on the first retry rather than on a real defect.
                const unique = `smoke${Date.now().toString(36)}`;

                await page.fill('input[name="schoolName"]', 'Route Smoke Academy');
                await page.fill('input[name="adminFirstName"]', 'Route');
                await page.fill('input[name="adminLastName"]', 'Smoke');
                await page.fill('input[name="email"]', `${unique}@routesmoke.test`);
                await page.fill('input[name="domain"]', unique);
                await page.fill('input[name="password"]', 'route-smoke-password-123');

                await page.getByRole('button', { name: /Create Workspace/i }).click();

                // The action returns a flat { error } that the page renders inline
                // behind a ⚠️. That is what provisioning failure looks like, and it
                // is what this case exists to catch: `INSERT INTO tenants
                // (... billing_status ...)` referenced a column that lives on
                // companies, so every visitor got "Failed to create workspace
                // database. Please try again later." and no workspace.
                const inlineError = page.locator('text=/⚠️/');
                await Promise.race([
                    page.waitForURL((url) => new URL(url).pathname !== '/setup', { timeout: 30_000 }),
                    inlineError.waitFor({ state: 'visible', timeout: 30_000 }).then(async () => {
                        throw new Error(
                            `/setup refused to provision a workspace: ${(await inlineError.innerText()).trim()}`,
                        );
                    }),
                ]);

                // Provisioning succeeded: the company, tenant and admin were written
                // and the session was established, so the app navigated away.
                check(
                    new URL(page.url()).pathname,
                    'a provisioned workspace must leave /setup',
                ).not.toBe('/setup');

                // SCHOOL_ADMIN is in MFA_REQUIRED_ROLES and production MFA is
                // mandatory, so onboarding hands straight to enrolment. Landing on
                // /login here means the administrator was locked out of the account
                // it had just created — the dead end this flow exists to prevent.
                await page.waitForURL('**/mfa/setup', { timeout: 30_000 });

                // The page shows the raw secret for manual entry. Reading it is what
                // lets this test act as the authenticator app would, so the whole
                // enrolment is exercised for real rather than stubbed.
                await check(page.locator('[data-testid="mfa-qr"]')).toBeVisible();
                const secret = (await page.locator('[data-testid="mfa-secret"]').innerText()).trim();
                check(secret, 'enrolment must expose a secret for manual entry').toMatch(/^[A-Z2-7]{16,}$/);

                // Ten single-use recovery codes, because a lost phone must not mean
                // a lost tenant — there is no SMS or email fallback by design.
                await check(page.locator('[data-testid="mfa-backup-codes"] li')).toHaveCount(10);

                await page.locator('[data-testid="mfa-codes-saved"]').check();
                await page.fill('[data-testid="mfa-code-input"]', authenticator.generate(secret));
                await page.locator('[data-testid="mfa-activate"]').click();

                const mfaError = page.locator('[data-testid="mfa-error"]');
                await Promise.race([
                    page.waitForURL('**/pricing', { timeout: 30_000 }),
                    mfaError.waitFor({ state: 'visible', timeout: 30_000 }).then(async () => {
                        throw new Error(
                            `MFA enrolment refused a valid code: ${(await mfaError.innerText()).trim()}`,
                        );
                    }),
                ]);

                check(
                    new URL(page.url()).pathname,
                    'a fully enrolled administrator should reach checkout',
                ).toBe('/pricing');
            } finally {
                await page.close();
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // Parent portal — a different role, a different layout, and the only
    // surface a paying customer's customer ever sees.
    // ─────────────────────────────────────────────────────────────────────
    test.describe('Route smoke — parent portal', () => {
        // Deliberately NOT serial: a smoke gate should report every broken route
        // in one run, not stop at the first. The shared page is safe because the
        // config pins fullyParallel:false with a single worker.

        let page: Page;

        test.beforeAll(async ({ browser }: { browser: Browser }) => {
            page = await browser.newPage();
            await signIn(page, PARENT_EMAIL, '/overview', '/overview, /my-fees');
        });

        test.afterAll(async () => {
            await page?.close();
        });

        test('/overview shows the linked child and their three summary cards', async () => {
            await visit(page, '/overview');

            // The seed links this guardian to Aarav Sharma. If the guardians join
            // stops resolving, the page still returns 200 and renders this instead
            // — a green status code over a completely broken portal.
            await check(page.getByText('No child linked to your account')).toHaveCount(0);

            // The seed links this guardian to the first student, so the heading and
            // the admission number are both fixed values — a guardians join that
            // silently returns nothing cannot satisfy them.
            await check(page.getByRole('heading', { name: 'Aarav Sharma', level: 1 })).toBeVisible();
            await check(page.getByText(/Admission GWD202500001/)).toBeVisible();

            await check(page.getByRole('heading', { name: 'Attendance this month' })).toBeVisible();
            await check(page.getByRole('heading', { name: 'Outstanding fees' })).toBeVisible();
            await check(page.getByRole('heading', { name: 'Latest published result' })).toBeVisible();

            // Outstanding fees is formatCurrency() over the child's invoices:
            // ₹45,000 still pending, with the ₹15,000 and ₹10,000 invoices settled.
            await check(page.getByText('₹45,000').first()).toBeVisible();
        });

        test('/my-fees renders the child fee ledger', async () => {
            await visit(page, '/my-fees');

            await check(page.getByRole('heading', { name: 'Fees', level: 1 })).toBeVisible();

            // The ledger streams in client-side, so assert the settled state —
            // "Loading…" disappearing is what proves the fetch resolved.
            await check(page.getByText('Total outstanding')).toBeVisible();
            await check(
                page.getByText('No child is linked to your account yet, so there are no fee records to show.'),
            ).toHaveCount(0);
            await check(page.getByText('Loading fee records…')).toHaveCount(0);

            // Invoices is the default tab; Payments is the other half of the ledger.
            await check(page.getByText('Fee invoices')).toBeVisible();

            // All three of this child's invoices, so a ledger that renders its
            // chrome over an empty fetch cannot pass.
            for (const invoice of ['INV-2026-001', 'INV-2025-0001', 'INV-2025-089']) {
                await check(page.getByText(invoice)).toBeVisible();
            }

            await page.getByRole('button', { name: 'Payments', exact: true }).click();
            await check(page.getByText('Payment history')).toBeVisible();
        });
    });

    // ─────────────────────────────────────────────────────────────────────
    // NAVIGATION SWEEP
    // ─────────────────────────────────────────────────────────────────────
    //
    // The tests above assert CONTENT on twelve routes — real figures, real
    // invoice numbers — because a page rendering its chrome over an empty fetch
    // is this product's characteristic failure, and only a figure catches it.
    //
    // But twelve is not the nav. check-navigation-targets.mjs knows 161 routes
    // and proves every nav link points at a file that exists; it never renders
    // one. So a link could resolve to a page that 500s on load and both gates
    // stayed green — which is exactly how /executive shipped a SUM over a column
    // that did not exist.
    //
    // This sweep closes that: every link a real sidebar offers is visited with a
    // session the POLICY says can reach it. The routes are read from the same
    // nav files the audit reads, and reachability is decided by importing the
    // real page-access policy rather than by a list maintained here — so a nav
    // link added tomorrow is swept tomorrow, with no edit to this file.
    //
    // It asserts rendering, not content. That is a deliberately weaker claim
    // than the tests above, and it is worth stating plainly: a swept route shows
    // HTTP 200, no bounce to /login, and no server-exception boundary. It does
    // NOT show that the page found any data. Adding a figure assertion per route
    // needs seed data shaped for each one; this is the layer that can exist now.

    /** The nav files the navigation audit already treats as the link surface. */
    const STAFF_NAV_SOURCES = [
        'src/app/(admin)/layout.tsx',
        'src/app/(dashboard)/layout.tsx',
        'src/components/dashboard/ModuleGrid.tsx',
    ];
    const PARENT_NAV_SOURCES = ['src/app/(parent)/layout.tsx'];

    /**
     * Already asserted with real figures above. Re-visiting them here would only
     * add page loads to a gate whose whole design note is that a slow gate gets
     * switched off.
     */
    const COVERED_WITH_CONTENT = new Set([
        '/fees',
        '/fees/plans',
        '/invoices',
        '/executive',
        '/students',
        '/admissions',
        '/exams',
        '/attendance',
        '/overview',
        '/my-fees',
    ]);

    function navRoutesFor(role: string, sources: readonly string[]): string[] {
        const links = new Set<string>();
        for (const source of sources) {
            const contents = readFileSync(resolve(__dirname, '..', source), 'utf8');
            // The same expression check-navigation-targets.mjs uses, so the two
            // cannot disagree about what a nav link is.
            for (const match of contents.matchAll(/href[=:]\s*["'](\/[^"'`$]*)["']/g)) {
                links.add(match[1]);
            }
        }
        return [...links]
            .filter((route) => !COVERED_WITH_CONTENT.has(route))
            .filter((route) => {
                const pathname = route.split('?')[0];
                return isRoleAllowedForPage(role, getPageAccessPolicy(pathname));
            })
            .sort();
    }

    const STAFF_NAV_ROUTES = navRoutesFor(FINANCE_USER.role, STAFF_NAV_SOURCES);
    const PARENT_NAV_ROUTES = navRoutesFor('PARENT', PARENT_NAV_SOURCES);

    test.describe('Route smoke — staff navigation sweep', () => {
        let page: Page;

        test.beforeAll(async ({ browser }: { browser: Browser }) => {
            await provisionSmokeUsers();
            page = await browser.newPage();
            await signIn(page, FINANCE_USER.email, '/dashboard', 'the staff navigation sweep');
        });

        test.afterAll(async () => {
            await page?.close();
        });

        // Guard the guard: an extraction that silently matched nothing would
        // make this whole block pass by having no tests in it.
        test('the staff sidebar offers routes to sweep', () => {
            check(
                STAFF_NAV_ROUTES.length,
                'no staff nav links were extracted — the sweep would pass vacuously',
            ).toBeGreaterThan(8);
        });

        // One test per route: a sweep that stopped at the first broken page would
        // report one defect per run instead of all of them.
        for (const route of STAFF_NAV_ROUTES) {
            test(`${route} renders for a staff session`, async () => {
                await visit(page, route);
            });
        }
    });

    test.describe('Route smoke — parent navigation sweep', () => {
        let page: Page;

        test.beforeAll(async ({ browser }: { browser: Browser }) => {
            page = await browser.newPage();
            await signIn(page, PARENT_EMAIL, '/overview', 'the parent navigation sweep');
        });

        test.afterAll(async () => {
            await page?.close();
        });

        test('the parent sidebar offers routes to sweep', () => {
            check(
                PARENT_NAV_ROUTES.length,
                'no parent nav links were extracted — the sweep would pass vacuously',
            ).toBeGreaterThan(1);
        });

        for (const route of PARENT_NAV_ROUTES) {
            test(`${route} renders for a parent session`, async () => {
                await visit(page, route);
            });
        }
    });
}

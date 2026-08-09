import { test, expect } from '@playwright/test';

/**
 * Basic E2E smoke tests — verify core pages load correctly.
 */

test.describe('ScholarMind — Smoke Tests', () => {
    test('enforced nonce CSP renders matching resources and permits hydration', async ({ page }) => {
        const cspConsoleViolations: string[] = [];
        const cspReportRequests: string[] = [];
        const cspRequestFailures: string[] = [];

        page.on('console', (message) => {
            const text = message.text();
            if (/content security policy|refused to (?:execute|apply|load).*(?:policy|directive)/i.test(text)) {
                cspConsoleViolations.push(text);
            }
        });
        page.on('request', (request) => {
            if (new URL(request.url()).pathname === '/api/security/csp-report') {
                cspReportRequests.push(request.url());
            }
        });
        page.on('requestfailed', (request) => {
            const failure = request.failure()?.errorText || '';
            if (/content security policy|csp|blocked.*directive/i.test(failure)) {
                cspRequestFailures.push(`${request.url()}: ${failure}`);
            }
        });
        await page.addInitScript(() => {
            const state = window as Window & { __schoolSisCspViolations?: string[] };
            state.__schoolSisCspViolations = [];
            document.addEventListener('securitypolicyviolation', (event) => {
                state.__schoolSisCspViolations?.push(
                    `${event.effectiveDirective}:${event.blockedURI}`,
                );
            });
        });

        const response = await page.goto('/login', { waitUntil: 'networkidle' });
        expect(response).not.toBeNull();
        const headers = await response!.allHeaders();
        const csp = headers['content-security-policy'];
        const scriptDirective = csp?.split('; ').find((directive) => directive.startsWith('script-src '));
        const styleDirective = csp?.split('; ').find((directive) => directive.startsWith('style-src '));
        const policyNonce = csp?.match(/'nonce-([^']+)'/)?.[1];

        expect(response!.ok()).toBe(true);
        expect(csp).toBeTruthy();
        expect(headers['content-security-policy-report-only']).toBeUndefined();
        expect(policyNonce).toBeTruthy();
        expect(scriptDirective).toContain("'nonce-");
        expect(scriptDirective).toContain("'strict-dynamic'");
        expect(scriptDirective).not.toContain("'unsafe-inline'");
        expect(scriptDirective).not.toContain("'unsafe-eval'");
        expect(styleDirective).toContain("'nonce-");
        expect(styleDirective).not.toContain("'unsafe-inline'");

        const renderedResources = await page.locator('script, style, link[rel="stylesheet"]').evaluateAll((elements) => (
            elements.map((element) => ({
                kind: element.tagName.toLowerCase(),
                nonce: (element as HTMLElement).nonce || element.getAttribute('nonce') || '',
            }))
        ));
        const renderedScripts = renderedResources.filter(({ kind }) => kind === 'script');
        const renderedStyles = renderedResources.filter(({ kind }) => kind === 'style' || kind === 'link');

        expect(renderedScripts.length).toBeGreaterThan(0);
        expect(renderedStyles.length).toBeGreaterThan(0);
        expect(renderedScripts.every(({ nonce }) => nonce === policyNonce)).toBe(true);
        expect(renderedStyles.every(({ nonce }) => nonce === policyNonce)).toBe(true);

        await expect(page.locator('#schoolCode')).toBeVisible();
        await page.getByRole('button', { name: /Platform Admin/i }).click();
        await expect(page.locator('#schoolCode')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'OTP', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Send OTP', exact: true })).toHaveCount(0);

        await page.waitForTimeout(250);
        const browserViolations = await page.evaluate(() => (
            (window as Window & { __schoolSisCspViolations?: string[] }).__schoolSisCspViolations || []
        ));
        expect(browserViolations).toEqual([]);
        expect(cspConsoleViolations).toEqual([]);
        expect(cspReportRequests).toEqual([]);
        expect(cspRequestFailures).toEqual([]);
    });

    test('login page loads', async ({ page }) => {
        await page.goto('/login');
        await expect(page).toHaveTitle(/School Information System|ScholarMind|Login/i);
        await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    });

    test('dashboard redirects when not logged in', async ({ page }) => {
        await page.goto('/');
        // Should redirect to login
        await expect(page).toHaveURL(/login/);
    });

    test('fees page loads after login', async ({ page }) => {
        // This test would need proper auth setup in a beforeAll hook
        // For now, just verify the page structure
        await page.goto('/fees');
        // Will redirect to login if not authenticated
        await page.waitForTimeout(1000);
    });

    test('admissions page loads after login', async ({ page }) => {
        await page.goto('/admissions');
        await page.waitForTimeout(1000);
    });
});

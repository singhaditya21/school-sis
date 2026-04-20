# Security Report

This report outlines all security vulnerabilities and risks identified in the repository through automated dependency scanning and static analysis (SAST) tools.

## 1. Dependency Vulnerabilities
We ran `trivy`, `npm audit` and `pnpm audit` to identify known vulnerabilities (CVEs) in project dependencies. The list includes several critical and high severity flaws.

### Critical
- **jsPDF (v4.0.0, v4.2.0)**: Multiple critical vulnerabilities including **CVE-2026-31938** (Cross-site scripting via unsanitized output options) and **CVE-2026-31898** (Arbitrary code execution via unsanitized input in createAnnotation method). Update to `>=4.2.1`.
- **ajv (v8.12.0)**: Vulnerable to Regular Expression Denial of Service (ReDoS) when the `$data` option is enabled. Update to `>=8.17.1`.

### High
- **Next.js (v15.5.9, v15.5.12)**: **GHSA-h25m-26qc-wcjf** (HTTP request deserialization can lead to DoS when using insecure React Server Components). Unbounded disk cache growth (`CVE-2026-27980`) and HTTP request smuggling in rewrites (`CVE-2026-29057`). Update to `>=16.1.7` or a patched `15.x` version.
- **minimatch (v9.0.3)**: ReDoS vulnerability related to catastrophic backtracking when handling untrusted patterns. Update to `>=9.0.7`.
- **express (v4.18.2)**: Vulnerable to route caching issues and ReDoS depending on the route definitions.
- **react (v18.2.0)**: Some ReDoS and XSS vectors when unsanitized props are passed.
- **jsonwebtoken (v9.0.0)**: JWT validation bypasses or secret leakages in specific edge cases. Update to `>=9.0.2`.

### Medium
- **DOMPurify (v3.3.1)**: **CVE-2026-0540** (Cross-site scripting vulnerability). Update to `>=3.3.2`.
- **lodash (v4.17.21)**: **CVE-2025-13465** (Prototype pollution in `_.unset` and `_.omit` functions). Update to `>=4.17.23`.
- **flatted (v3.2.9)**: Unbounded recursion DoS in `parse()` revive phase. Update to `>=3.4.1`.

## 2. Code Vulnerabilities (Static Analysis)
We ran `semgrep` to identify common security flaws in the application code and infrastructure files.

### 2.1 Cryptographic Issues
- **File**: `apps/web/src/lib/encryption.ts` (Line 49)
  - **Issue**: The call to `createDecipheriv` with the Galois Counter Mode (GCM) mode of operation is missing an expected authentication tag length check. This can be abused by an attacker to spoof ciphertexts or recover the implicit authentication key of GCM, allowing arbitrary forgeries.

### 2.2 Path Traversal (Arbitrary File Access)
- **File**: `apps/web/src/lib/services/storage.ts` (Lines 43, 63, 68)
  - **Issue**: Detected possible user input going into a `path.join` or `path.resolve` function. This could lead to a path traversal vulnerability where the attacker can access arbitrary files. User input must be sanitized or strictly validated against an allowlist before being used in file paths.

### 2.3 Log Forging / Injection
- **Files**:
  - `apps/web/src/lib/actions/webhooks.ts` (Line 103)
  - `apps/web/src/lib/services/jobs.ts` (Line 58)
  - **Issue**: String concatenation with a non-literal variable in a `util.format` or `console.log` function. If an attacker injects a format specifier in the string, they could forge log messages, which can confuse logging systems or mask malicious activities.

### 2.4 Infrastructure & Configuration Risks
- **File**: `docker-compose.yml` (Line 5)
  - **Issue 1**: Service 'postgres' allows for privilege escalation via setuid or setgid binaries. **Recommendation:** Add `security_opt: ['no-new-privileges:true']` to prevent this.
  - **Issue 2**: Service 'postgres' is running with a writable root filesystem. **Recommendation:** Add `read_only: true` to prevent malicious apps from downloading and running additional payloads.

### 2.5 Hardcoded Secrets/Hashes
- **Files**:
  - `backend/app/bin/main/db/migration/V1__initial_schema.sql` (Lines 194, 208)
  - `backend/app/src/main/resources/db/migration/V1__initial_schema.sql` (Lines 194, 208)
  - **Issue**: Hardcoded bcrypt hashes were detected in the database migration scripts. While these are usually seed data, they should be reviewed to ensure no sensitive production credentials are leaked in the source code.

## Summary
The project contains several high-impact vulnerabilities, both in third-party dependencies (like `jsPDF`, `Next.js`) and in custom code (Path Traversal, GCM Auth Tag checking). It is highly recommended to update the dependencies to their respective patched versions and implement proper input sanitization in the `storage.ts` service.

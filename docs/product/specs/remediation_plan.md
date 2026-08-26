# ScholarMind V6 — Security & Package Vulnerability Remediation Plan

This document maps all high-severity package vulnerabilities, static code analysis findings, and cryptographic errors, detailing the exact patch and remediation procedures.

---

## 1. Dependency Vulnerability Mapping

The repository's dependencies must be upgraded to remediate critical security exploits.

| Package | CVE / Advisory | Severity | Vulnerability Description | Patched Version |
| :--- | :--- | :--- | :--- | :--- |
| **`jspdf`** | CVE-2026-31938 | **CRITICAL** | Cross-Site Scripting (XSS) via unsanitized output options. | `>=4.2.1` |
| **`jspdf`** | CVE-2026-31898 | **HIGH** | Arbitrary code execution via unsanitized input in the `createAnnotation` method. | `>=4.2.1` |
| **`next`** | GHSA-h25m-26qc-wcjf | **HIGH** | HTTP request deserialization Denial of Service (DoS) when using React Server Components. | `>=15.5.10` |
| **`next`** | GHSA-267c-6grr-h53f | **HIGH** | Middleware and Proxy bypass in App Router applications using segment-prefetch. | `>=16.2.5` |
| **`nodemailer`** | GHSA-p6gq-j5cr-w38f | **HIGH** | Message-level raw option bypasses file access checks, enabling arbitrary file read and SSRF. | `>=9.0.1` |
| **`lodash`** | CVE-2025-13465 | **MEDIUM** | Prototype pollution in `_.unset` and `_.omit` helper utilities. | `>=4.17.23` |

---

## 2. Static Code Analysis (Semgrep) & Cryptographic Remediation

### 2.1 Cryptographic Flaw: GCM Authentication Tag Length Validation
- **Location**: `apps/web/src/lib/encryption.ts` (Line 49)
- **Vulnerability**: A missing auth tag length check when calling `createDecipheriv` under Galois Counter Mode (GCM) can allow attackers to supply a shorter-than-expected tag, potentially facilitating ciphertext forgery.
- **Remediation**: Explicitly validate that `authTag.length === 16` before creating the decipher instance, and configure the tag length option `{ authTagLength: 16 }` directly in `createDecipheriv`.

### 2.2 Storage Security: Path Traversal Defenses
- **Location**: `apps/web/src/lib/services/storage.ts` (Lines 43, 63, 68)
- **Vulnerability**: Potential path traversal if user-supplied file names or upload keys are concatenated directly into paths.
- **Remediation**: Ensure the upload engine validates every object key against forbidden sequences (`..`, `\`, absolute prefixes, null bytes) and forces key prefix isolation (`${tenantId}/`).

---

## 3. Step-by-Step Remediation Playbook

1. **Step 1: Dependency Upgrade Command**:
   Update `apps/web/package.json` to the target safe versions, then execute:
   ```bash
   pnpm install
   ```
2. **Step 2: Code Quality Scan**:
   Verify cryptographic tag verification checks are active in `/apps/web/src/lib/encryption.ts`.
3. **Step 3: Run Dependency Audits**:
   Execute `pnpm audit --audit-level high` to confirm zero high/critical vulnerabilities remain.

---

## 4. Verification Scenarios (BDD)

### Scenario: Safe Decryption with Auth Tag Check
```gherkin
Given a ciphertext payload with a forged auth tag of length 8
When the decryption helper decrypt() is called
Then the system MUST:
  1. Detect that the authentication tag length is not exactly 16 bytes.
  2. Throw an error "Invalid authentication tag length".
  3. Abort the deciphering operation and return "[DECRYPTION ERROR]".
```

### Scenario: Blocking Path Traversal in File Uploads
```gherkin
Given a user attempts to upload a file with key "documents/../../../etc/passwd"
When the upload handler executes validateObjectKey()
Then the validation filter MUST:
  1. Detect the directory traversal sequence ".." in the normalized key.
  2. Throw a path traversal error.
  3. Block execution of the Cloudflare R2 API call.
```

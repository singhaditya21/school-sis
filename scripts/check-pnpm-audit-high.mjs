#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FAIL_SEVERITIES = new Set(["high", "critical"]);
const KNOWN_SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const OBSERVED_IMAGE_SIZE_VERSIONS = Object.freeze(["1.2.1"]);
const OBSERVED_BUILD_TOOL_SUFFIXES = Object.freeze([
  Object.freeze([
    "react-native@0.85.3",
    "@react-native/community-cli-plugin@0.85.3",
    "metro@0.84.4",
    "image-size@1.2.1",
  ]),
  Object.freeze(["@expo/metro@56.0.0", "metro@0.84.4", "image-size@1.2.1"]),
]);
const ALLOWED_EXCEPTION_POLICY = Object.freeze({
  "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr": Object.freeze({
    module: "image-size",
    severity: "high",
    pathPrefix: "apps/mobile >",
    expires: "2026-09-15",
    findingVersions: OBSERVED_IMAGE_SIZE_VERSIONS,
    buildToolSuffixes: OBSERVED_BUILD_TOOL_SUFFIXES,
  }),
  "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq": Object.freeze({
    module: "image-size",
    severity: "high",
    pathPrefix: "apps/mobile >",
    expires: "2026-09-15",
    findingVersions: OBSERVED_IMAGE_SIZE_VERSIONS,
    buildToolSuffixes: OBSERVED_BUILD_TOOL_SUFFIXES,
  }),
});

const allowlistPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "pnpm-audit-allowlist.json",
);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  const actualKeys = Object.keys(value).sort();
  const wantedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== wantedKeys.length ||
    actualKeys.some((key, index) => key !== wantedKeys[index])
  ) {
    throw new Error(`${label} must contain exactly: ${wantedKeys.join(", ")}`);
  }
}

function parseExpiration(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be a YYYY-MM-DD date`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const expiresAt = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  if (
    expiresAt.getUTCFullYear() !== year ||
    expiresAt.getUTCMonth() !== month - 1 ||
    expiresAt.getUTCDate() !== day
  ) {
    throw new Error(`${label} is not a valid calendar date`);
  }
  return expiresAt;
}

function validateAllowlist(allowlist) {
  assertPlainObject(allowlist, "Audit allowlist");
  assertExactKeys(allowlist, ["exceptions"], "Audit allowlist");
  assertPlainObject(allowlist.exceptions, "Audit allowlist exceptions");

  const expectedUrls = Object.keys(ALLOWED_EXCEPTION_POLICY);
  assertExactKeys(
    allowlist.exceptions,
    expectedUrls,
    "Audit allowlist exceptions",
  );

  for (const url of expectedUrls) {
    const exception = allowlist.exceptions[url];
    const policy = ALLOWED_EXCEPTION_POLICY[url];
    assertPlainObject(exception, `Audit exception ${url}`);
    assertExactKeys(
      exception,
      ["module", "severity", "pathPrefix", "expires", "reason"],
      `Audit exception ${url}`,
    );
    if (exception.module !== policy.module) {
      throw new Error(`Audit exception ${url} has an unexpected module`);
    }
    if (exception.severity !== policy.severity) {
      throw new Error(`Audit exception ${url} has an unexpected severity`);
    }
    if (exception.pathPrefix !== policy.pathPrefix) {
      throw new Error(`Audit exception ${url} has an unexpected path prefix`);
    }
    if (exception.expires !== policy.expires) {
      throw new Error(`Audit exception ${url} has an unexpected expiration`);
    }
    parseExpiration(exception.expires, `Audit exception ${url} expiration`);
    if (
      typeof exception.reason !== "string" ||
      exception.reason.trim() === ""
    ) {
      throw new Error(`Audit exception ${url} must include a reason`);
    }
  }
}

function validateFindingPath(path, findingVersion, policy, label) {
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (path.includes("\0") || /[\r\n]/.test(path)) {
    throw new Error(`${label} contains control characters`);
  }

  const segments = path.split(" > ");
  if (
    segments.length < 2 ||
    segments.some((segment) => segment.trim() !== segment || segment === "")
  ) {
    throw new Error(`${label} is not a valid pnpm dependency path`);
  }
  if (`${segments[0]} >` !== policy.pathPrefix) {
    throw new Error(`${label} escapes the allowed ${policy.pathPrefix} scope`);
  }

  for (const segment of segments) {
    const normalized = segment.replaceAll("\\", "/");
    if (
      normalized === "." ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      normalized.endsWith("/..") ||
      normalized.includes("/../")
    ) {
      throw new Error(`${label} contains a path escape`);
    }
  }

  if (!policy.findingVersions.includes(findingVersion)) {
    throw new Error(
      `${label} uses unapproved vulnerable version ${findingVersion}`,
    );
  }
  if (segments.at(-1) !== `${policy.module}@${findingVersion}`) {
    throw new Error(
      `${label} must terminate in ${policy.module}@${findingVersion}`,
    );
  }

  const hasObservedBuildToolSuffix = policy.buildToolSuffixes.some((suffix) =>
    suffix.every(
      (segment, index) =>
        segments[segments.length - suffix.length + index] === segment,
    ),
  );
  if (!hasObservedBuildToolSuffix) {
    throw new Error(
      `${label} does not match an observed mobile build-tool graph`,
    );
  }
}

function validateAuditReport(report) {
  assertPlainObject(report, "Audit report");
  assertPlainObject(report.metadata, "Audit report metadata");
  assertPlainObject(
    report.metadata.vulnerabilities,
    "Audit report vulnerability metadata",
  );

  const vulnerabilities = report.metadata.vulnerabilities;
  assertExactKeys(
    vulnerabilities,
    KNOWN_SEVERITIES,
    "Audit report vulnerability metadata",
  );
  for (const severity of KNOWN_SEVERITIES) {
    const count = vulnerabilities[severity];
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(
        `Audit report vulnerability count for ${severity} must be a non-negative integer`,
      );
    }
  }

  assertPlainObject(report.advisories, "Audit report advisories");
  const advisories = Object.entries(report.advisories).map(
    ([key, advisory]) => {
      assertPlainObject(advisory, `Audit advisory ${key}`);
      if (!Number.isSafeInteger(advisory.id) || advisory.id < 1) {
        throw new Error(`Audit advisory ${key} has an invalid id`);
      }
      if (String(advisory.id) !== key) {
        throw new Error(`Audit advisory ${key} does not match its id`);
      }
      if (
        typeof advisory.module_name !== "string" ||
        advisory.module_name.trim() === ""
      ) {
        throw new Error(`Audit advisory ${key} is missing module_name`);
      }
      if (typeof advisory.title !== "string" || advisory.title.trim() === "") {
        throw new Error(`Audit advisory ${key} is missing title`);
      }
      if (typeof advisory.url !== "string" || advisory.url.trim() === "") {
        throw new Error(`Audit advisory ${key} is missing url`);
      }
      if (!KNOWN_SEVERITIES.includes(advisory.severity)) {
        throw new Error(`Audit advisory ${key} has an invalid severity`);
      }
      if (!Array.isArray(advisory.findings) || advisory.findings.length === 0) {
        throw new Error(`Audit advisory ${key} has no findings`);
      }
      for (const [findingIndex, finding] of advisory.findings.entries()) {
        assertPlainObject(
          finding,
          `Audit advisory ${key} finding ${findingIndex}`,
        );
        if (
          typeof finding.version !== "string" ||
          finding.version.trim() === ""
        ) {
          throw new Error(
            `Audit advisory ${key} finding ${findingIndex} is missing version`,
          );
        }
        if (!Array.isArray(finding.paths) || finding.paths.length === 0) {
          throw new Error(
            `Audit advisory ${key} finding ${findingIndex} has no paths`,
          );
        }
        for (const [pathIndex, path] of finding.paths.entries()) {
          if (typeof path !== "string" || path.trim() === "") {
            throw new Error(
              `Audit advisory ${key} finding ${findingIndex} path ${pathIndex} must be a non-empty string`,
            );
          }
        }
      }
      return advisory;
    },
  );

  for (const severity of FAIL_SEVERITIES) {
    const advisoryCount = advisories.filter(
      (advisory) => advisory.severity === severity,
    ).length;
    if (vulnerabilities[severity] !== advisoryCount) {
      throw new Error(
        `Audit report ${severity} metadata/advisory mismatch: metadata=${vulnerabilities[severity]} advisories=${advisoryCount}`,
      );
    }
  }

  const failAdvisoryUrls = advisories
    .filter((advisory) => FAIL_SEVERITIES.has(advisory.severity))
    .map((advisory) => advisory.url);
  if (new Set(failAdvisoryUrls).size !== failAdvisoryUrls.length) {
    throw new Error("Audit report contains duplicate high/critical advisories");
  }

  return { advisories, vulnerabilities };
}

export function evaluateAuditReport(report, allowlist, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Audit evaluation time must be a valid Date");
  }
  validateAllowlist(allowlist);
  const { advisories, vulnerabilities } = validateAuditReport(report);
  const allowedAdvisories = [];
  const blockingAdvisories = [];

  for (const advisory of advisories) {
    if (!FAIL_SEVERITIES.has(advisory.severity)) continue;

    const exception = allowlist.exceptions[advisory.url];
    const policy = ALLOWED_EXCEPTION_POLICY[advisory.url];
    if (
      !exception ||
      !policy ||
      exception.module !== advisory.module_name ||
      policy.module !== advisory.module_name ||
      exception.severity !== advisory.severity ||
      policy.severity !== advisory.severity
    ) {
      blockingAdvisories.push(advisory);
      continue;
    }

    const expiresAt = parseExpiration(
      exception.expires,
      `Audit exception ${advisory.url} expiration`,
    );
    if (now > expiresAt) {
      blockingAdvisories.push(advisory);
      continue;
    }

    for (const [findingIndex, finding] of advisory.findings.entries()) {
      for (const [pathIndex, path] of finding.paths.entries()) {
        validateFindingPath(
          path,
          finding.version,
          policy,
          `Audit advisory ${advisory.id} finding ${findingIndex} path ${pathIndex}`,
        );
      }
    }
    allowedAdvisories.push({ advisory, exception });
  }

  return { vulnerabilities, allowedAdvisories, blockingAdvisories };
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read ${label} at ${path}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export function run(argv = process.argv.slice(2), now = new Date()) {
  const auditPath = argv.find((arg) => arg !== "--") || "pnpm-audit-high.json";

  try {
    const report = readJson(auditPath, "pnpm audit report");
    const allowlist = readJson(allowlistPath, "pnpm audit allowlist");
    const result = evaluateAuditReport(report, allowlist, now);
    const { vulnerabilities, allowedAdvisories, blockingAdvisories } = result;

    console.log(
      [
        "pnpm audit summary:",
        `critical=${vulnerabilities.critical}`,
        `high=${vulnerabilities.high}`,
        `moderate=${vulnerabilities.moderate}`,
        `low=${vulnerabilities.low}`,
      ].join(" "),
    );

    if (blockingAdvisories.length > 0) {
      console.error("High or critical dependency advisories found:");
      for (const advisory of blockingAdvisories) {
        console.error(
          `- ${advisory.module_name}: ${advisory.title} (${advisory.severity}) ${advisory.url}`,
        );
      }
      return 1;
    }

    for (const { advisory, exception } of allowedAdvisories) {
      console.warn(
        `Temporarily accepted ${advisory.module_name} advisory ${advisory.url} ` +
          `only for ${exception.pathPrefix} (expires ${exception.expires}): ${exception.reason}`,
      );
    }

    console.log(
      allowedAdvisories.length > 0
        ? `No unaccepted high or critical advisories found; ${allowedAdvisories.length} scoped exception(s) remain active.`
        : "No high or critical dependency advisories found.",
    );
    return 0;
  } catch (error) {
    console.error(
      `Invalid pnpm audit input: ${error instanceof Error ? error.message : error}`,
    );
    return 1;
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = run();

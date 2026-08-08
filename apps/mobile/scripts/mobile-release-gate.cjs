'use strict';

const readiness = require('../release-readiness.json');

const NON_PRODUCTION_TARGETS = new Set(['development', 'preview']);

function commandLineTarget(argv) {
  const targetIndex = argv.indexOf('--target');
  if (targetIndex === -1) return undefined;
  return argv[targetIndex + 1];
}

function resolveReleaseTarget(env = process.env, argv = process.argv.slice(2), fallback = 'production') {
  const value = commandLineTarget(argv)
    || env.MOBILE_RELEASE_TARGET
    || env.EAS_BUILD_PROFILE
    || (env.NODE_ENV === 'production' ? 'production' : fallback);
  return String(value).trim().toLowerCase();
}

function incompleteCapabilities(status = readiness) {
  return Object.entries(status.requiredCapabilities || {})
    .filter(([, complete]) => complete !== true)
    .map(([capability]) => capability);
}

function evaluateMobileRelease(target, status = readiness) {
  const normalizedTarget = String(target || '').trim().toLowerCase();
  // Only the two explicitly internal profiles are allowed while gated. Unknown
  // or renamed profiles fail closed so a store build cannot bypass the gate by
  // avoiding the word "production".
  const productionTarget = !NON_PRODUCTION_TARGETS.has(normalizedTarget);
  const incomplete = incompleteCapabilities(status);
  const ready = status.productionReady === true && incomplete.length === 0;

  if (!productionTarget || ready) {
    return { allowed: true, target: normalizedTarget, incomplete };
  }

  return {
    allowed: false,
    target: normalizedTarget,
    incomplete,
    reason: `Mobile ${normalizedTarget} packaging is blocked: real authentication is not production-ready. Incomplete capabilities: ${incomplete.join(', ')}.`,
  };
}

function assertMobileReleaseAllowed(target, status = readiness) {
  const result = evaluateMobileRelease(target, status);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
  return result;
}

if (require.main === module) {
  const target = resolveReleaseTarget();
  try {
    assertMobileReleaseAllowed(target);
    console.log(`Mobile ${target} build allowed by release-readiness.json.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  NON_PRODUCTION_TARGETS,
  assertMobileReleaseAllowed,
  evaluateMobileRelease,
  incompleteCapabilities,
  readiness,
  resolveReleaseTarget,
};

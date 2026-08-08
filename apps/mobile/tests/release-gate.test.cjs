'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  evaluateMobileRelease,
  readiness,
  resolveReleaseTarget,
} = require('../scripts/mobile-release-gate.cjs');

const MOBILE_ROOT = path.resolve(__dirname, '..');

test('production, store, and unknown packaging profiles remain blocked while auth is incomplete', () => {
  for (const target of ['production', 'release', 'store', 'qa-store-candidate']) {
    const result = evaluateMobileRelease(target);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /real authentication is not production-ready/);
    assert.deepEqual(result.incomplete.sort(), Object.keys(readiness.requiredCapabilities).sort());
  }
});

test('development and internal preview builds remain available', () => {
  assert.equal(evaluateMobileRelease('development').allowed, true);
  assert.equal(evaluateMobileRelease('preview').allowed, true);
});

test('the target comes from checked build context and cannot be opened by a readiness env flag', () => {
  const env = {
    EAS_BUILD_PROFILE: 'production',
    MOBILE_PRODUCTION_READY: 'true',
  };
  const target = resolveReleaseTarget(env, [], 'development');

  assert.equal(target, 'production');
  assert.equal(evaluateMobileRelease(target).allowed, false);
});

test('Expo config resolution refuses the production profile before packaging', () => {
  const previousTarget = process.env.MOBILE_RELEASE_TARGET;
  process.env.MOBILE_RELEASE_TARGET = 'production';
  delete require.cache[require.resolve('../app.config.js')];

  try {
    const configure = require('../app.config.js');
    assert.throws(
      () => configure({ config: { name: 'mobile', slug: 'mobile' } }),
      /Mobile production packaging is blocked/,
    );
  } finally {
    if (previousTarget === undefined) delete process.env.MOBILE_RELEASE_TARGET;
    else process.env.MOBILE_RELEASE_TARGET = previousTarget;
  }
});

test('Expo config resolution fails closed when no checked build target is supplied', () => {
  const previousTarget = process.env.MOBILE_RELEASE_TARGET;
  const previousProfile = process.env.EAS_BUILD_PROFILE;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.MOBILE_RELEASE_TARGET;
  delete process.env.EAS_BUILD_PROFILE;
  delete process.env.NODE_ENV;
  delete require.cache[require.resolve('../app.config.js')];

  try {
    const configure = require('../app.config.js');
    assert.throws(
      () => configure({ config: { name: 'mobile', slug: 'mobile' } }),
      /Mobile production packaging is blocked/,
    );
  } finally {
    if (previousTarget === undefined) delete process.env.MOBILE_RELEASE_TARGET;
    else process.env.MOBILE_RELEASE_TARGET = previousTarget;
    if (previousProfile === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = previousProfile;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('Payment and Notifications are absent from the shipped navigator', () => {
  const appSource = fs.readFileSync(path.join(MOBILE_ROOT, 'App.tsx'), 'utf8');

  assert.doesNotMatch(appSource, /TuitionPaymentScreen|NotificationCenterScreen/);
  assert.doesNotMatch(appSource, /name=["'](?:Payment|Notifications)["']/);
  assert.doesNotMatch(appSource, /StripeProvider/);
});

test('EAS production and submit profiles are explicitly present and gated', () => {
  const easConfig = JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'eas.json'), 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'package.json'), 'utf8'));

  assert.equal(easConfig.build.production.distribution, 'store');
  assert.equal(easConfig.build.production.env.MOBILE_RELEASE_TARGET, 'production');
  assert.ok(easConfig.submit.production);
  assert.equal(packageJson.scripts['eas-build-pre-install'], 'node scripts/mobile-release-gate.cjs');
  assert.match(packageJson.scripts['build:production'], /mobile-release-gate/);
  assert.match(packageJson.scripts['submit:production'], /mobile-release-gate/);
  assert.match(packageJson.scripts.start, /run-development-expo/);
});

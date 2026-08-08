'use strict';

const {
  assertMobileReleaseAllowed,
  readiness,
  resolveReleaseTarget,
} = require('./scripts/mobile-release-gate.cjs');

module.exports = ({ config }) => {
  // Fail closed when Expo is invoked outside the checked development wrapper
  // or an explicit EAS profile. This also prevents an ad-hoc export/submit from
  // silently treating the unauthenticated client as a production application.
  const target = resolveReleaseTarget(process.env, [], 'production');
  assertMobileReleaseAllowed(target);

  return {
    ...config,
    name: readiness.productionReady
      ? 'School SIS Mobile'
      : 'School SIS Mobile (Auth Disabled)',
    description: readiness.productionReady
      ? config.description
      : 'Internal development preview. Authentication, payments, and notifications are disabled; not for production distribution.',
    extra: {
      ...(config.extra || {}),
      mobileRelease: {
        target,
        productionReady: readiness.productionReady,
        authenticatedFeaturesExposed: false,
      },
    },
  };
};

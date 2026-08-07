import prepareMainEnvironment from './global-setup';
import prepareWorkerEnvironment from './global-setup-worker';

const suite = process.argv[2];
const prepareEnvironment = suite === 'main'
    ? prepareMainEnvironment
    : suite === 'worker'
        ? prepareWorkerEnvironment
        : null;

if (!prepareEnvironment) {
    console.error('Usage: prepare-test-environment.ts <main|worker>');
    process.exitCode = 1;
} else {
    void prepareEnvironment().catch((error) => {
        console.error('[Test Setup] Failed to prepare the Playwright database:', error);
        process.exitCode = 1;
    });
}

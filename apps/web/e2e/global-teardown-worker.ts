import { dropDatabase, ensurePlaywrightTestEnvironment } from './test-environment';

export default async function globalTeardown() {
    if (process.env.SCHOOL_SIS_KEEP_TEST_DB === 'true') {
        console.log('\n🧹 [Test Teardown] Preserving isolated worker database environment for reuse...');
        console.log('✅ Global teardown complete!\n');
        return;
    }

    console.log('\n🧹 [Test Teardown] Dropping isolated worker database environment...');
    const environment = ensurePlaywrightTestEnvironment({
        envFileName: '.env.test.worker',
        defaultDatabaseName: 'school_sis_test_worker',
    });

    try {
        await dropDatabase(environment);
    } catch (error) {
        console.warn('[Test Teardown] Failed to drop worker test database:', error);
    }
    console.log('✅ Global teardown complete!\n');
}

export default async function globalTeardown() {
    console.log('\n🧹 [Test Teardown] Preserving isolated worker database environment for reuse...');
    console.log('✅ Global teardown complete!\n');
}

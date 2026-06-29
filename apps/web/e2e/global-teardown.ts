import { Client } from 'pg';
import path from 'path';
import fs from 'fs';

export default async function globalTeardown() {
    console.log('\n🧹 [Test Teardown] Preserving isolated database environment for reuse...');
    console.log('✅ Global teardown complete!\n');
}

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isReconstructionArtifact,
  sqlStatements,
  toPreparable,
} from '../apps/web/scripts/check-sql-prepare.mjs';

/**
 * The probe itself needs a migrated database, so CI runs it in the job that
 * already builds one. What can be tested without a database is the part that
 * decides WHICH failures count — and that is the part worth pinning, because a
 * suppression that grew too broad would leave the probe reporting nothing while
 * still looking like a gate.
 */

test('reports the two errors this exists to catch', () => {
  assert.equal(isReconstructionArtifact('42P01', 'relation "x" does not exist'), false);
  assert.equal(isReconstructionArtifact('42703', 'column "x" does not exist'), false);
});

test('suppresses failures caused by binding an untyped placeholder', () => {
  // The real code binds a correctly-typed value; the harness can only bind $1.
  for (const code of ['42P18', '42601', '42P02', '42804', '42P08', '42725']) {
    assert.equal(isReconstructionArtifact(code, 'whatever'), true, code);
  }
});

test('splits the one ambiguous code by its message, not by the code alone', () => {
  // A type-resolution failure is the harness's fault...
  assert.equal(
    isReconstructionArtifact('42883', 'operator does not exist: uuid = timestamp with time zone'),
    true,
  );
  // ...but a genuinely missing function is a defect, and must still be reported.
  assert.equal(
    isReconstructionArtifact('42883', 'function some_missing_helper(integer) does not exist'),
    false,
  );
});

test('finds whole statements and ignores prose and fragments', () => {
  const source = [
    'const q = `SELECT id FROM students WHERE tenant_id = $1`;',
    'const note = `routes work away from the dedicated pool`;',
    'const fragment = `AND status = $1`;',
    'const upd = `UPDATE students SET name = $1 WHERE id = $2`;',
  ].join('\n');
  const found = sqlStatements(source).map((s) => s.sql.trim());
  assert.equal(found.length, 2);
  assert.match(found[0], /^SELECT id FROM students/);
  assert.match(found[1], /^UPDATE students SET/);
});

test('turns template interpolations into bound parameters', () => {
  assert.equal(
    toPreparable('SELECT id FROM students WHERE tenant_id = ${tenantId} AND name = ${name}'),
    'SELECT id FROM students WHERE tenant_id = $1 AND name = $2',
  );
});

test('refuses a statement that interpolates an identifier', () => {
  // A parameter cannot stand where a table name goes, so rebuilding it would
  // test something the application never runs. Dropped rather than guessed at.
  assert.equal(toPreparable('SELECT id FROM ${table} WHERE x = 1'), null);
  assert.equal(toPreparable('UPDATE ${t} SET a = 1'), null);
});

test('does not treat a SQL comment mentioning SELECT as a statement', () => {
  // A real newline: with an escaped one the comment would swallow the whole
  // string, which is what this test asserted the first time it was written.
  const source = [
    'const c = `-- SELECT is described here',
    'SELECT id FROM students`;',
  ].join('\n');
  const found = sqlStatements(source);
  assert.equal(found.length, 1);
  assert.doesNotMatch(found[0].sql, /described here/);
});

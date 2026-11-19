import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeReadOnlySql } from './sqlSafety';

test('isSafeReadOnlySql allows clean SELECT, WITH, and PRAGMA queries', () => {
  assert.equal(isSafeReadOnlySql('SELECT * FROM records LIMIT 10;').safe, true);
  assert.equal(isSafeReadOnlySql('WITH c AS (SELECT * FROM kv_store) SELECT * FROM c').safe, true);
  assert.equal(isSafeReadOnlySql('PRAGMA table_info(records)').safe, true);
});

test('isSafeReadOnlySql rejects writes, DDL, and multi-statement queries', () => {
  assert.equal(isSafeReadOnlySql('DROP TABLE records').safe, false);
  assert.equal(isSafeReadOnlySql('DELETE FROM kv_store').safe, false);
  assert.equal(isSafeReadOnlySql('SELECT 1; DROP TABLE records').safe, false);
  assert.equal(isSafeReadOnlySql("INSERT INTO kv_store VALUES ('a','b','c','d')").safe, false);
});

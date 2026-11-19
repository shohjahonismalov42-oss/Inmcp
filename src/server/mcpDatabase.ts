import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isSafeReadOnlySql } from '../lib/sqlSafety';

export interface KvRecord {
  namespace: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface CollectionRecord {
  id: number;
  collection: string;
  title: string;
  data: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface AiRunRecord {
  id: string;
  tier: string;
  provider: string;
  model: string;
  prompt_preview: string;
  duration_ms: number;
  status: string;
  created_at: string;
}

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'mcp-bridge.sqlite');

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const dbPath = process.env.MCP_DB_PATH
    ? path.resolve(process.env.MCP_DB_PATH)
    : DEFAULT_DB_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kv_store (
      namespace TEXT NOT NULL DEFAULT 'default',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (namespace, key)
    );
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection TEXT NOT NULL DEFAULT 'notes',
      title TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);
    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      tier TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_preview TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  dbInstance = db;
  return db;
}

export function upsertKv(namespace: string, key: string, value: unknown): KvRecord {
  const db = getDb();
  const ns = namespace.trim() || 'default';
  const k = key.trim();
  if (!k) throw new Error("Kalit (key) bo'sh bo'lishi mumkin emas.");
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO kv_store (namespace, key, value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(namespace, key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  ).run(ns, k, serialized, now);

  return { namespace: ns, key: k, value: serialized, updated_at: now };
}

export function getKv(namespace: string, key: string): KvRecord | null {
  const db = getDb();
  const ns = namespace.trim() || 'default';
  const row = db
    .prepare('SELECT namespace, key, value, updated_at FROM kv_store WHERE namespace = ? AND key = ?')
    .get(ns, key.trim()) as KvRecord | undefined;
  return row ?? null;
}

export function listKv(namespace?: string, search?: string, limit = 50): KvRecord[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (namespace && namespace.trim()) {
    clauses.push('namespace = ?');
    params.push(namespace.trim());
  }
  if (search && search.trim()) {
    clauses.push('(key LIKE ? OR value LIKE ?)');
    const pat = `%${search.trim()}%`;
    params.push(pat, pat);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.min(Math.max(limit, 1), 200));

  return db
    .prepare(
      `SELECT namespace, key, value, updated_at FROM kv_store ${where} ORDER BY updated_at DESC LIMIT ?`
    )
    .all(...params) as unknown as KvRecord[];
}

export function deleteKv(namespace: string, key: string): number {
  const db = getDb();
  const res = db
    .prepare('DELETE FROM kv_store WHERE namespace = ? AND key = ?')
    .run(namespace.trim() || 'default', key.trim());
  return Number(res.changes);
}

export function insertRecord(
  collection: string,
  title: string,
  data: unknown,
  tags = ''
): CollectionRecord {
  const db = getDb();
  const col = collection.trim() || 'notes';
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  const now = new Date().toISOString();

  const res = db
    .prepare(
      `INSERT INTO records (collection, title, data, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(col, title.trim(), serialized, tags.trim(), now, now);

  return {
    id: Number(res.lastInsertRowid),
    collection: col,
    title: title.trim(),
    data: serialized,
    tags: tags.trim(),
    created_at: now,
    updated_at: now,
  };
}

export function queryRecords(
  collection?: string,
  search?: string,
  limit = 50
): CollectionRecord[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (collection && collection.trim()) {
    clauses.push('collection = ?');
    params.push(collection.trim());
  }
  if (search && search.trim()) {
    clauses.push('(title LIKE ? OR data LIKE ? OR tags LIKE ?)');
    const pat = `%${search.trim()}%`;
    params.push(pat, pat, pat);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.min(Math.max(limit, 1), 200));

  return db
    .prepare(
      `SELECT id, collection, title, data, tags, created_at, updated_at
       FROM records ${where} ORDER BY id DESC LIMIT ?`
    )
    .all(...params) as unknown as CollectionRecord[];
}

export function deleteRecord(id: number): number {
  const db = getDb();
  const res = db.prepare('DELETE FROM records WHERE id = ?').run(id);
  return Number(res.changes);
}

export function runReadOnlySql(sql: string): unknown[] {
  const check = isSafeReadOnlySql(sql);
  if (!check.safe) {
    throw new Error(check.reason || "Xavfli SQL so'rovi rad etildi.");
  }
  const db = getDb();
  const clean = sql.trim().replace(/;+\s*$/, '');
  return db.prepare(clean).all() as unknown[];
}

export function recordAiRun(entry: Omit<AiRunRecord, 'created_at'>): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_runs (id, tier, provider, model, prompt_preview, duration_ms, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.id,
    entry.tier,
    entry.provider,
    entry.model,
    entry.prompt_preview.slice(0, 180),
    entry.duration_ms,
    entry.status,
    now
  );
}

export function listAiRuns(limit = 30): AiRunRecord[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, tier, provider, model, prompt_preview, duration_ms, status, created_at
       FROM ai_runs ORDER BY created_at DESC LIMIT ?`
    )
    .all(Math.min(Math.max(limit, 1), 100)) as unknown as AiRunRecord[];
}

export function getDbStats(): {
  kvCount: number;
  recordCount: number;
  aiRunCount: number;
  collections: string[];
  dbPath: string;
} {
  const db = getDb();
  const kvRow = db.prepare('SELECT COUNT(*) as c FROM kv_store').get() as { c: number };
  const recRow = db.prepare('SELECT COUNT(*) as c FROM records').get() as { c: number };
  const aiRow = db.prepare('SELECT COUNT(*) as c FROM ai_runs').get() as { c: number };
  const cols = db
    .prepare('SELECT DISTINCT collection FROM records ORDER BY collection')
    .all() as Array<{ collection: string }>;

  return {
    kvCount: Number(kvRow?.c || 0),
    recordCount: Number(recRow?.c || 0),
    aiRunCount: Number(aiRow?.c || 0),
    collections: cols.map((c) => c.collection),
    dbPath: process.env.MCP_DB_PATH
      ? path.resolve(process.env.MCP_DB_PATH)
      : DEFAULT_DB_PATH,
  };
}

/**
 * A Map-compatible key/value collection. Two implementations satisfy it:
 *   - the native `Map` (in-memory; used by tests and when no DB is configured)
 *   - `SqlMap` (below), backed by a SQLite table via better-sqlite3
 *
 * Because better-sqlite3 is synchronous, SqlMap keeps the exact synchronous
 * surface the services rely on — so persistence needs no async refactor.
 *
 * IMPORTANT: `get()` returns a fresh, deserialized object each call (unlike a
 * native Map, which returns the same reference). Any code that mutates a fetched
 * entity in place MUST write it back with `set()`. The services do.
 */
import type Database from "better-sqlite3";

export interface KVMap<K extends string, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): this;
  has(key: K): boolean;
  delete(key: K): boolean;
  values(): IterableIterator<V>;
  keys(): IterableIterator<K>;
  entries(): IterableIterator<[K, V]>;
  forEach(cb: (value: V, key: K, map: KVMap<K, V>) => void): void;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<[K, V]>;
}

// A native Map<string, V> structurally satisfies KVMap<string, V>.

export class SqlMap<V> implements KVMap<string, V> {
  private readonly getStmt: Database.Statement;
  private readonly setStmt: Database.Statement;
  private readonly hasStmt: Database.Statement;
  private readonly delStmt: Database.Statement;
  private readonly allStmt: Database.Statement;
  private readonly keyStmt: Database.Statement;
  private readonly countStmt: Database.Statement;

  constructor(db: Database.Database, table: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) throw new Error(`bad table name: ${table}`);
    db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    this.getStmt = db.prepare(`SELECT v FROM "${table}" WHERE k = ?`);
    this.setStmt = db.prepare(
      `INSERT INTO "${table}" (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
    );
    this.hasStmt = db.prepare(`SELECT 1 FROM "${table}" WHERE k = ?`);
    this.delStmt = db.prepare(`DELETE FROM "${table}" WHERE k = ?`);
    this.allStmt = db.prepare(`SELECT k, v FROM "${table}"`);
    this.keyStmt = db.prepare(`SELECT k FROM "${table}"`);
    this.countStmt = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`);
  }

  get(key: string): V | undefined {
    const row = this.getStmt.get(key) as { v: string } | undefined;
    return row ? (JSON.parse(row.v) as V) : undefined;
  }

  set(key: string, value: V): this {
    this.setStmt.run(key, JSON.stringify(value));
    return this;
  }

  has(key: string): boolean {
    return this.hasStmt.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.delStmt.run(key).changes > 0;
  }

  *values(): IterableIterator<V> {
    for (const row of this.allStmt.iterate() as Iterable<{ v: string }>) {
      yield JSON.parse(row.v) as V;
    }
  }

  *keys(): IterableIterator<string> {
    for (const row of this.keyStmt.iterate() as Iterable<{ k: string }>) yield row.k;
  }

  *entries(): IterableIterator<[string, V]> {
    for (const row of this.allStmt.iterate() as Iterable<{ k: string; v: string }>) {
      yield [row.k, JSON.parse(row.v) as V];
    }
  }

  forEach(cb: (value: V, key: string, map: KVMap<string, V>) => void): void {
    for (const [k, v] of this.entries()) cb(v, k, this);
  }

  get size(): number {
    return (this.countStmt.get() as { n: number }).n;
  }

  [Symbol.iterator](): IterableIterator<[string, V]> {
    return this.entries();
  }
}

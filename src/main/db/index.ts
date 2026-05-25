import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { app } from 'electron/main';
import { runMigrations } from './migrate.js';
import { logger } from '../utils/logger.js';

let _db: BetterSqlite3.Database | null = null;

export function initDatabase(): BetterSqlite3.Database {
  if (_db) return _db;

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'medileader.db');

  logger.info(`Opening database at: ${dbPath}`);

  const db = new BetterSqlite3(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? (msg) => logger.debug(msg) : undefined,
  });

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456');
  db.pragma('cache_size = -32000'); // 32MB page cache

  runMigrations(db);

  _db = db;
  logger.info('Database ready');
  return db;
}

export function getDatabase(): BetterSqlite3.Database {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.');
  return _db;
}

export function closeDatabase(): void {
  if (_db) {
    _db.close();
    _db = null;
    logger.info('Database closed');
  }
}

export type DB = BetterSqlite3.Database;

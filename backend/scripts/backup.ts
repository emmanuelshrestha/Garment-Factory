/**
 * Hot backup script for Garment Factory.
 *
 * Uses SQLite VACUUM INTO to create a safe, consistent snapshot of the database
 * while the server is running. A plain file copy of a live SQLite database can
 * be torn; VACUUM INTO cannot.
 *
 * Usage:
 *   npm run backup                 # backup + prune using defaults
 *   npm run backup -- --keep 60    # keep 60 days instead of 30
 *   npm run backup -- --no-prune   # back up without deleting anything
 *   npm run backup -- --dir /mnt/usb/garment
 *
 * Retention is a safety valve, not the only copy: the operator is still
 * expected to copy snapshots off the factory machine.
 */

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config.ts';
import { backupTo, closeDatabase, openDatabase } from '../src/db/sqlite.ts';

const BACKUP_SUFFIX = '.db';
const DEFAULT_KEEP_DAYS = config.backupKeepDays;

function parseArgs(argv: string[]): { keepDays: number; prune: boolean; dir: string } {
  let keepDays = DEFAULT_KEEP_DAYS;
  let prune = true;
  let dir = config.backupDir;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--keep' || arg === '--keep-days') {
      const raw = argv[i + 1];
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`--keep expects a non-negative integer, got ${JSON.stringify(raw)}`);
      }
      keepDays = parsed;
      i += 1;
    } else if (arg.startsWith('--keep=')) {
      const parsed = Number(arg.slice('--keep='.length));
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`--keep expects a non-negative integer, got ${JSON.stringify(arg)}`);
      }
      keepDays = parsed;
    } else if (arg === '--no-prune') {
      prune = false;
    } else if (arg === '--dir') {
      const raw = argv[i + 1];
      if (!raw) throw new Error('--dir expects a path');
      dir = raw;
      i += 1;
    } else if (arg.startsWith('--dir=')) {
      dir = arg.slice('--dir='.length);
    } else {
      throw new Error(`unknown argument ${JSON.stringify(arg)}`);
    }
  }

  return { keepDays, prune, dir };
}

/**
 * Filename timestamp in local time, sortable and filesystem-safe:
 *   backup-YYYY-MM-DD_HHmmss.db
 * Local time is deliberate: an operator reading the folder should see the
 * wall clock on the factory machine, not UTC.
 */
function backupFileName(now = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `backup-${date}_${time}${BACKUP_SUFFIX}`;
}

/**
 * Delete snapshots older than `keepDays`, but never the one just written.
 * Only files matching the backup pattern are touched, so a stray file dropped
 * in the directory (a manual copy, a restored database) is left alone.
 */
function pruneOldBackups(dir: string, keepDays: number, justWritten: string): number {
  if (keepDays <= 0) {
    return 0;
  }
  if (!existsSync(dir)) {
    return 0;
  }

  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const name of readdirSync(dir)) {
    if (!name.startsWith('backup-') || !name.endsWith(BACKUP_SUFFIX)) {
      continue;
    }
    if (name === justWritten) {
      continue;
    }
    const full = join(dir, name);
    try {
      const stats = statSync(full);
      if (!stats.isFile()) {
        continue;
      }
      if (stats.mtimeMs < cutoff) {
        unlinkSync(full);
        removed += 1;
        console.log(`pruned ${name}`);
      }
    } catch (error) {
      // A single undeletable file must not fail the backup that already succeeded.
      console.warn(`could not prune ${name}: ${(error as Error).message}`);
    }
  }

  return removed;
}

function createBackup(): void {
  const options = parseArgs(process.argv.slice(2));

  if (!existsSync(config.databasePath)) {
    console.error(`Database not found at ${config.databasePath}. Nothing to backup.`);
    process.exit(1);
  }

  // The directory is created on demand so a fresh factory machine needs no setup.
  mkdirSync(options.dir, { recursive: true });

  const fileName = backupFileName();
  const backupFilePath = join(options.dir, fileName);

  // Two backups inside the same second must not silently overwrite one another;
  // append a counter instead of failing the run.
  let finalPath = backupFilePath;
  let finalName = fileName;
  if (existsSync(finalPath)) {
    const stem = fileName.slice(0, -BACKUP_SUFFIX.length);
    let n = 2;
    while (existsSync(join(options.dir, `${stem}-${n}${BACKUP_SUFFIX}`))) {
      n += 1;
    }
    finalName = `${stem}-${n}${BACKUP_SUFFIX}`;
    finalPath = join(options.dir, finalName);
  }

  console.log(`Starting backup of ${config.databasePath}...`);
  const db = openDatabase(config.databasePath);

  try {
    backupTo(db, finalPath);
    const stats = statSync(finalPath);
    console.log(`Backup written: ${finalPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  } finally {
    closeDatabase(db);
  }

  if (!options.prune) {
    console.log('Retention pruning skipped (--no-prune).');
    return;
  }

  const removed = pruneOldBackups(options.dir, options.keepDays, finalName);
  console.log(
    removed === 0
      ? `Retention: nothing older than ${options.keepDays} day(s) to remove.`
      : `Retention: removed ${removed} backup(s) older than ${options.keepDays} day(s).`,
  );
}

createBackup();

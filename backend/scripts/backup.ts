/**
 * Hot backup script for Garment Factory.
 *
 * Uses SQLite VACUUM INTO to create a safe, consistent snapshot of the database
 * while the server is running.
 */

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config.ts';
import { backupTo, closeDatabase, openDatabase } from '../src/db/sqlite.ts';
import { nowTimestamp } from '../src/domain/dates.ts';

function createBackup(): void {
  if (!existsSync(config.databasePath)) {
    console.error(`Database not found at ${config.databasePath}. Nothing to backup.`);
    process.exit(1);
  }

  mkdirSync(config.backupDir, { recursive: true });

  const timestamp = nowTimestamp().replace(/[:.]/g, '-').replace('T', '_');
  const backupFileName = `garment-${timestamp}.db`;
  const backupFilePath = join(config.backupDir, backupFileName);

  console.log(`Starting backup of ${config.databasePath}...`);
  const db = openDatabase(config.databasePath);

  try {
    backupTo(db, backupFilePath);
    const stats = statSync(backupFilePath);
    const sizeKb = (stats.size / 1024).toFixed(1);
    console.log(`Backup completed successfully: ${backupFilePath} (${sizeKb} KB)`);
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  } finally {
    closeDatabase(db);
  }
}

createBackup();

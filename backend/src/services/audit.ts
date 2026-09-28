/**
 * The audit trail (D013).
 *
 * Append-only, and deliberately dumb: one row per thing that happened, with
 * the old and the new value where a status changed. Nothing reads this table
 * to make a decision — it exists so that months later the owner can ask "who
 * voided that invoice, and when" and get an answer.
 *
 * Written inside the caller's transaction, so an audit row cannot survive a
 * rolled-back change and a committed change cannot lose its audit row.
 */

import type { Tx } from '../db/sqlite.ts';
import { nowTimestamp } from '../domain/dates.ts';

export type AuditEntry = {
  /** What happened, in the past tense: 'invoice_issued', 'invoice_voided'. */
  action: string;
  entityType: string;
  entityId: number;
  /** Old and new status, plus anything else worth keeping. */
  detail?: Record<string, unknown>;
  userId: number | null;
};

export function recordAudit(tx: Tx, entry: AuditEntry): number {
  const info = tx.db
    .prepare(
      `INSERT INTO audit_log (at, user_id, action, entity_type, entity_id, detail_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      nowTimestamp(),
      entry.userId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.detail === undefined ? null : JSON.stringify(entry.detail),
    );
  return Number(info.lastInsertRowid);
}

export type AuditRow = {
  id: number;
  at: string;
  userId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  detail: Record<string, unknown> | null;
};

export function listAudit(
  tx: Tx,
  filter: { entityType?: string; entityId?: number; limit?: number } = {},
): AuditRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.entityType !== undefined) {
    clauses.push('entity_type = ?');
    params.push(filter.entityType);
  }
  if (filter.entityId !== undefined) {
    clauses.push('entity_id = ?');
    params.push(filter.entityId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(filter.limit ?? 200);

  const rows = tx.db
    .prepare(
      `SELECT id, at, user_id, action, entity_type, entity_id, detail_json
         FROM audit_log
         ${where}
        ORDER BY id DESC
        LIMIT ?`,
    )
    .all(...(params as never[])) as Array<{
    id: number;
    at: string;
    user_id: number | null;
    action: string;
    entity_type: string;
    entity_id: number | null;
    detail_json: string | null;
  }>;

  return rows.map((row) => ({
    id: Number(row.id),
    at: row.at,
    userId: row.user_id === null ? null : Number(row.user_id),
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id === null ? null : Number(row.entity_id),
    detail: row.detail_json === null ? null : (JSON.parse(row.detail_json) as Record<string, unknown>),
  }));
}

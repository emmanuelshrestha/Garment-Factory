/**
 * Allocating document numbers (DECISIONS.md D017).
 *
 * The sequence row is read and incremented inside the CALLER's transaction.
 * That is the whole point: if the order fails to save, the number is rolled
 * back with it and is issued to the next order instead. Numbers are therefore
 * gapless, and two documents can never share one.
 *
 * This function takes a `Tx`, not a `Db`, so it cannot be called outside a
 * transaction by accident.
 */

import type { Tx } from '../db/sqlite.ts';
import { type DocType, assertDocType, formatDocumentNumber } from '../domain/documentNumber.ts';

/**
 * Reserve the next number for `docType` in `year` and return it.
 *
 * `INSERT ... ON CONFLICT DO UPDATE` makes creating the first number of a
 * fiscal year and incrementing an existing one the same single statement, so
 * there is no read-then-write window for a second writer to slip into. The
 * transaction's BEGIN IMMEDIATE already serialises writers; this keeps the
 * statement atomic regardless.
 */
export function nextDocumentNumber(tx: Tx, docType: DocType, year: number): string {
  assertDocType(docType);

  const row = tx.db
    .prepare(
      `INSERT INTO document_sequences (doc_type, doc_year, last_number)
       VALUES (?, ?, 1)
       ON CONFLICT (doc_type, doc_year)
         DO UPDATE SET last_number = last_number + 1
       RETURNING last_number`,
    )
    .get(docType, year) as { last_number: number };

  return formatDocumentNumber(docType, year, Number(row.last_number));
}

/** The last number issued, without reserving anything. For display only. */
export function peekLastNumber(tx: Tx, docType: DocType, year: number): number {
  const row = tx.db
    .prepare('SELECT last_number FROM document_sequences WHERE doc_type = ? AND doc_year = ?')
    .get(docType, year) as { last_number: number } | undefined;
  return row ? Number(row.last_number) : 0;
}

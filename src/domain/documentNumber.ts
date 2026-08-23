/**
 * Document numbers: ORD-2026-00001 (DECISIONS.md D017).
 *
 * The year is the AD calendar year of the document's own date and the sequence
 * resets on 1 January, independently per document type.
 *
 * Pure formatting and parsing. Allocating the next sequence is a database
 * operation and lives in services/documentNumbers.ts, because it must happen
 * inside the same transaction as the document it names.
 */

import { ValidationError } from './errors.ts';

export const DOC_TYPES = ['ORD', 'DEL', 'INV', 'PAY', 'EXP', 'PUR', 'ADJ'] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  ORD: 'Order',
  DEL: 'Delivery',
  INV: 'Invoice',
  PAY: 'Payment',
  EXP: 'Expense',
  PUR: 'Purchase',
  ADJ: 'Stock adjustment',
};

const SEQUENCE_DIGITS = 5;
const MAX_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1;

export function isDocType(value: unknown): value is DocType {
  return typeof value === 'string' && (DOC_TYPES as readonly string[]).includes(value);
}

export function assertDocType(value: unknown): DocType {
  if (!isDocType(value)) {
    throw new ValidationError(`docType must be one of ${DOC_TYPES.join(', ')}, got ${JSON.stringify(value)}`, 'docType');
  }
  return value;
}

/**
 * `formatDocumentNumber('ORD', 2026, 1)` -> `'ORD-2026-00001'`
 *
 * Five digits is 99,999 documents of one type in one fiscal year. Rather than
 * silently widening to six and producing numbers that sort differently from
 * the earlier ones, this throws — a business that hits it needs to decide what
 * it wants, not have a format change chosen for it.
 */
export function formatDocumentNumber(docType: DocType, year: number, sequence: number): string {
  assertDocType(docType);
  assertDocumentYear(year);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new ValidationError(`sequence must be a positive whole number, got ${sequence}`, 'sequence');
  }
  if (sequence > MAX_SEQUENCE) {
    throw new ValidationError(
      `sequence ${sequence} exceeds ${MAX_SEQUENCE}, the most ${DOC_TYPE_LABELS[docType]} documents ` +
        `the ${year} numbering format allows. Widening the format is a business decision.`,
      'sequence',
    );
  }
  return `${docType}-${year}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}

export function parseDocumentNumber(text: string): {
  docType: DocType;
  year: number;
  sequence: number;
} {
  const match = /^([A-Z]{3})-(\d{4})-(\d{5})$/.exec(text.trim());
  if (!match) {
    throw new ValidationError(
      `document number must look like ORD-2026-00001, got ${JSON.stringify(text)}`,
      'documentNumber',
    );
  }
  const [, docType, year, sequence] = match;
  return {
    docType: assertDocType(docType),
    year: Number(year),
    sequence: Number(sequence),
  };
}

function assertDocumentYear(year: number): number {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new ValidationError(`year must be between 2000 and 2200, got ${year}`, 'year');
  }
  return year;
}

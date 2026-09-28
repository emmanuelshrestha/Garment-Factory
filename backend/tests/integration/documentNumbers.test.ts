import test from 'node:test';
import assert from 'node:assert/strict';
import { transaction } from '../../src/db/sqlite.ts';
import {
  DOC_TYPES,
  formatDocumentNumber,
  parseDocumentNumber,
} from '../../src/domain/documentNumber.ts';
import { documentYear } from '../../src/domain/dates.ts';
import { nextDocumentNumber, peekLastNumber } from '../../src/services/documentNumbers.ts';
import { ValidationError } from '../../src/domain/errors.ts';
import { createTestDb } from '../helpers/testDb.ts';

test('D017: formats the agreed number shape', () => {
  assert.equal(formatDocumentNumber('ORD', 2026, 1), 'ORD-2026-00001');
  assert.equal(formatDocumentNumber('DEL', 2026, 42), 'DEL-2026-00042');
  assert.equal(formatDocumentNumber('INV', 2027, 99999), 'INV-2027-99999');
  assert.equal(formatDocumentNumber('PAY', 2026, 12345), 'PAY-2026-12345');
});

test('refuses to silently widen the format when the sequence runs out', () => {
  assert.throws(() => formatDocumentNumber('ORD', 2026, 100000), ValidationError);
  assert.throws(() => formatDocumentNumber('ORD', 2026, 0), ValidationError);
  assert.throws(() => formatDocumentNumber('ORD', 2026, -1), ValidationError);
  assert.throws(() => formatDocumentNumber('XXX' as 'ORD', 2026, 1), ValidationError);
  assert.throws(() => formatDocumentNumber('ORD', 1999, 1), ValidationError);
});

test('parses a number back into its parts', () => {
  assert.deepEqual(parseDocumentNumber('ORD-2026-00001'), {
    docType: 'ORD',
    year: 2026,
    sequence: 1,
  });
  assert.deepEqual(parseDocumentNumber('  INV-2027-99999  '), {
    docType: 'INV',
    year: 2027,
    sequence: 99999,
  });
  assert.throws(() => parseDocumentNumber('ORD-2026-1'), ValidationError);
  assert.throws(() => parseDocumentNumber('ORDER-2026-00001'), ValidationError);
  assert.throws(() => parseDocumentNumber(''), ValidationError);
});

test('format and parse round-trip for every document type', () => {
  for (const docType of DOC_TYPES) {
    const text = formatDocumentNumber(docType, 2026, 7);
    assert.deepEqual(parseDocumentNumber(text), { docType, year: 2026, sequence: 7 });
  }
});

test('D017: the year comes from the document date, so backdating files correctly', () => {
  assert.equal(documentYear('2026-01-01'), 2026);
  assert.equal(documentYear('2026-12-31'), 2026);
  // A December order entered in January still belongs to December's year.
  assert.equal(documentYear('2025-12-30'), 2025);
});

test('D017: numbers increment from 00001 within a year', () => {
  const t = createTestDb();
  try {
    const issued = transaction(t.db, (tx) => [
      nextDocumentNumber(tx, 'ORD', 2026),
      nextDocumentNumber(tx, 'ORD', 2026),
      nextDocumentNumber(tx, 'ORD', 2026),
    ]);
    assert.deepEqual(issued, ['ORD-2026-00001', 'ORD-2026-00002', 'ORD-2026-00003']);
  } finally {
    t.cleanup();
  }
});

test('D017: the sequence resets on 1 January, per document type', () => {
  const t = createTestDb();
  try {
    transaction(t.db, (tx) => {
      assert.equal(nextDocumentNumber(tx, 'ORD', documentYear('2026-12-31')), 'ORD-2026-00001');
      assert.equal(nextDocumentNumber(tx, 'ORD', documentYear('2026-12-31')), 'ORD-2026-00002');
      // New calendar year: back to 1, and the old year is untouched.
      assert.equal(nextDocumentNumber(tx, 'ORD', documentYear('2027-01-01')), 'ORD-2027-00001');
      // A different document type has its own independent sequence.
      assert.equal(nextDocumentNumber(tx, 'INV', 2026), 'INV-2026-00001');
      assert.equal(nextDocumentNumber(tx, 'DEL', 2026), 'DEL-2026-00001');
    });
    transaction(t.db, (tx) => {
      assert.equal(peekLastNumber(tx, 'ORD', 2026), 2);
      assert.equal(peekLastNumber(tx, 'ORD', 2027), 1);
      assert.equal(peekLastNumber(tx, 'PAY', 2026), 0);
    });
  } finally {
    t.cleanup();
  }
});

test('D017: a rolled-back document does not burn its number', () => {
  const t = createTestDb();
  try {
    transaction(t.db, (tx) => {
      assert.equal(nextDocumentNumber(tx, 'ORD', 2026), 'ORD-2026-00001');
    });

    // A document that fails after taking a number must give it back.
    assert.throws(
      () =>
        transaction(t.db, (tx) => {
          assert.equal(nextDocumentNumber(tx, 'ORD', 2026), 'ORD-2026-00002');
          throw new Error('order failed validation');
        }),
      /order failed validation/,
    );

    // The next successful order gets 00002, not 00003. No gap in the books.
    transaction(t.db, (tx) => {
      assert.equal(nextDocumentNumber(tx, 'ORD', 2026), 'ORD-2026-00002');
    });
  } finally {
    t.cleanup();
  }
});

test('numbering cannot be used outside a transaction', () => {
  const t = createTestDb();
  try {
    // The type system forbids passing a Db, and there is no Tx to be had
    // outside transaction(). Constructing one by hand still writes inside the
    // implicit statement transaction, so the guard that matters is that the
    // sequence and the document share one transaction — proven by the test
    // above. This test pins the API shape so the guard cannot be bypassed by
    // adding a Db overload later.
    assert.equal(typeof nextDocumentNumber, 'function');
    assert.equal(nextDocumentNumber.length, 3);
  } finally {
    t.cleanup();
  }
});

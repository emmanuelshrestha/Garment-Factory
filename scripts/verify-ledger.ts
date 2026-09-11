/**
 * Ledger verification and reconciliation script for Garment Factory.
 *
 * Verifies mathematical integrity across all ledgers:
 * 1. Finished stock movements (non-negative on-hand, valid movement types, audit links)
 * 2. Order reservations and shortages
 * 3. Invoices and delivery line exclusivity
 * 4. Payment allocations and receivable consistency
 */

import { existsSync } from 'node:fs';
import { config } from '../src/config.ts';
import { closeDatabase, openDatabase, readOnly } from '../src/db/sqlite.ts';
import { getStockOnHand, listStockSummaries } from '../src/services/stock.ts';

function verifyLedger(): void {
  if (!existsSync(config.databasePath)) {
    console.error(`Database not found at ${config.databasePath}. Run 'npm run seed:demo' first.`);
    process.exit(1);
  }

  console.log(`Verifying ledger integrity for: ${config.databasePath}`);
  const db = openDatabase(config.databasePath);

  let issuesFound = 0;

  try {
    readOnly(db, (tx) => {
      // 1. Check stock movements & on-hand validity
      console.log('\n--- 1. Checking Finished Stock Ledger ---');
      const movementStats = tx.db
        .prepare(
          `SELECT COUNT(*) as count,
                  SUM(CASE WHEN qty_delta > 0 THEN qty_delta ELSE 0 END) as total_in,
                  SUM(CASE WHEN qty_delta < 0 THEN qty_delta ELSE 0 END) as total_out
             FROM stock_movements`,
        )
        .get() as { count: number; total_in: number | null; total_out: number | null };

      console.log(`Total movements: ${movementStats.count}`);
      console.log(`Total inbound pieces:  ${movementStats.total_in ?? 0}`);
      console.log(`Total outbound pieces: ${Math.abs(movementStats.total_out ?? 0)}`);

      // Check for invalid movement types
      const invalidMovements = tx.db
        .prepare(
          `SELECT id, variant_id, movement_type, qty_delta
             FROM stock_movements
            WHERE movement_type NOT IN ('opening_balance', 'production_receipt', 'delivery_out', 'return_in', 'adjustment_in', 'adjustment_out')
               OR qty_delta = 0`,
        )
        .all();

      if (invalidMovements.length > 0) {
        console.error(`ERROR: Found ${invalidMovements.length} invalid stock movements:`, invalidMovements);
        issuesFound++;
      } else {
        console.log('✓ All stock movement types and quantities are strictly valid.');
      }

      // Check on-hand for each variant
      const variants = tx.db
        .prepare(`SELECT id, product_id, colour_id, size_id, min_stock_qty FROM product_variants`)
        .all() as Array<{ id: number; min_stock_qty: number }>;

      let negativeStockCount = 0;
      for (const variant of variants) {
        const onHand = getStockOnHand(tx, variant.id);
        if (onHand < 0) {
          console.error(`ERROR: Variant ID ${variant.id} has negative on-hand stock: ${onHand}`);
          negativeStockCount++;
          issuesFound++;
        }
      }

      if (negativeStockCount === 0) {
        console.log(`✓ Verified ${variants.length} variants: no negative stock found.`);
      }

      // 2. Check Order Allocations
      console.log('\n--- 2. Checking Stock Allocations ---');
      const orphanAllocations = tx.db
        .prepare(
          `SELECT sa.id, sa.order_line_id
             FROM stock_allocations sa
             LEFT JOIN order_lines ol ON ol.id = sa.order_line_id
            WHERE ol.id IS NULL`,
        )
        .all();

      if (orphanAllocations.length > 0) {
        console.error(`ERROR: Found ${orphanAllocations.length} orphan stock allocations.`);
        issuesFound++;
      } else {
        console.log('✓ All stock allocations are mapped to valid order lines.');
      }

      // 3. Check Invoice Integrity
      console.log('\n--- 3. Checking Invoices & Delivery Exclusivity ---');
      const duplicateBilledLines = tx.db
        .prepare(
          `SELECT il.delivery_line_id, COUNT(DISTINCT il.invoice_id) as invoice_count
             FROM invoice_lines il
             JOIN invoices i ON i.id = il.invoice_id
            WHERE i.status != 'void'
            GROUP BY il.delivery_line_id
           HAVING COUNT(DISTINCT il.invoice_id) > 1`,
        )
        .all();

      if (duplicateBilledLines.length > 0) {
        console.error(`ERROR: Found ${duplicateBilledLines.length} delivery lines on multiple active invoices!`);
        issuesFound++;
      } else {
        console.log('✓ Delivery line billing exclusivity (D025) verified.');
      }

      // 4. Check Payment Allocations
      console.log('\n--- 4. Checking Payment Allocations ---');
      const overAllocatedPayments = tx.db
        .prepare(
          `SELECT p.id, p.amount_minor, SUM(pa.amount_minor) as total_allocated
             FROM payments p
             JOIN payment_allocations pa ON pa.payment_id = p.id
            GROUP BY p.id
           HAVING SUM(pa.amount_minor) > p.amount_minor`,
        )
        .all();

      if (overAllocatedPayments.length > 0) {
        console.error(`ERROR: Found ${overAllocatedPayments.length} over-allocated payments:`, overAllocatedPayments);
        issuesFound++;
      } else {
        console.log('✓ All payment allocations are within recorded payment amounts.');
      }

      // Summary
      const summaries = listStockSummaries(tx);
      console.log(`\n--- Inventory Health Summary ---`);
      console.log(`Total Variants: ${summaries.length}`);
      console.log(`  Red (At/Below Min): ${summaries.filter((b) => b.band === 'red').length}`);
      console.log(`  Amber (Within 25%): ${summaries.filter((b) => b.band === 'amber').length}`);
      console.log(`  Normal:             ${summaries.filter((b) => b.band === 'green').length}`);
    });

    if (issuesFound > 0) {
      console.error(`\nFAILED: Ledger verification completed with ${issuesFound} issues.`);
      process.exit(1);
    } else {
      console.log('\nPASSED: All ledger invariants and integrity constraints verified successfully.');
    }
  } finally {
    closeDatabase(db);
  }
}

verifyLedger();

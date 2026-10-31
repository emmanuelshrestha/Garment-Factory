import { config } from '../src/config.ts';
import { openDatabase, closeDatabase, transaction } from '../src/db/sqlite.ts';
import { listStockSummaries } from '../src/services/stock.ts';
import { listBags, createBag } from '../src/services/bags.ts';

const db = openDatabase(config.databasePath);

try {
  transaction(db, (tx) => {
    console.log('--- Overriding Floor Bags with Owner Finished Stock ---');

    const bagNames = ['Bag-1', 'Bag-2', 'Bag-3', 'Bag-4', 'Bag-5'];
    let currentBags = listBags(tx);

    for (const name of bagNames) {
      if (!currentBags.some((b) => b.name === name)) {
        createBag(tx, name, 'Standard floor storage bag');
        console.log(`Created: ${name}`);
      }
    }

    currentBags = listBags(tx);
    const bagIds = currentBags.map((b) => b.id);

    const summaries = listStockSummaries(tx, { activeOnly: true });
    const inStock = summaries.filter((s) => s.onHand > 0);

    tx.db.prepare('DELETE FROM bag_contents').run();

    let totalPacked = 0;

    for (const item of inStock) {
      let remaining = item.onHand;
      let bagIdx = item.variantId % bagIds.length;

      while (remaining > 0) {
        const bagId = bagIds[bagIdx];
        const packQty = remaining > 15 ? Math.ceil(remaining / 2) : remaining;

        tx.db.prepare(`
          INSERT INTO bag_contents (bag_id, variant_id, quantity, updated_at)
          VALUES (?, ?, ?, datetime('now'))
        `).run(bagId, item.variantId, packQty);

        totalPacked += packQty;
        remaining -= packQty;
        bagIdx = (bagIdx + 1) % bagIds.length;
      }
    }

    console.log(`Successfully mapped ${totalPacked} pieces across ${currentBags.length} floor bags.`);
  });
} catch (err) {
  console.error('Failed to sync bags:', err);
} finally {
  closeDatabase(db);
}

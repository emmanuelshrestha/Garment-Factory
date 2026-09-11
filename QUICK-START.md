# Quick Start Guide

Get the Garment Factory Management System running in 5 minutes.

---

## Prerequisites

- **Node.js 22 LTS** installed ([download here](https://nodejs.org/))
- Windows, macOS, or Linux

---

## Steps

### 1. Start the Backend

```bash
# Apply database migrations
npm run migrate

# Seed with demo data (optional but recommended for first-time)
npm run seed:demo

# Start the server
npm start
```

You should see:
```
applied migrations: (if any new ones)
garment server listening on 0.0.0.0:4000
database: C:\Users\Lenovo\Desktop\Garment Factory\data\data.db
ui:       http://localhost:4000/ [console (console/index.html)]
```

### 2. Build the Frontend (First Time Only)

Open a **new terminal window**:

```bash
cd web
npm install
npm run build
cd ..
```

This creates `web/dist/` which the server will automatically serve.

### 3. Access the Application

Open your browser and navigate to:

**http://localhost:4000**

You should see the dashboard with sample data (if you ran seed:demo).

---

## What You Can Do Now

### View Dashboard
- See order statistics
- Check inventory levels
- View shortages

### Manage Products
- Navigate to Catalogue
- View products, colours, sizes
- See product variants
- Check price history

### Manage Customers
- View customer list
- Search by name, code, or phone
- See customer details

### Create an Order
1. Go to Orders
2. Click "New Order"
3. Select customer
4. Add products with quantities
5. Save as draft
6. Confirm to allocate stock

### Process Delivery
1. Go to Deliveries
2. Create new delivery from confirmed order
3. Review packing list
4. Dispatch (this moves stock)

### Generate Invoice
1. Go to Invoices
2. Click "New Invoice"
3. Select dispatched delivery lines
4. Add optional discount
5. Issue invoice

### Record Payment
1. Go to Payments
2. Record new payment
3. Select payment method (cash/bank/cheque)
4. Allocate to invoices
5. For cheques, mark as cleared when funds arrive

### View Inventory
1. Go to Stock
2. See inventory matrix by product/colour/size
3. Check low-stock alerts
4. Perform stock adjustments if needed

---

## Demo Data Includes

If you ran `npm run seed:demo`:

- **3 Products:** Premium Jacket, Classic Jacket, Sport Jacket
- **8 Colours:** Black, Navy, Grey, Brown, Khaki, Olive, Burgundy, Charcoal
- **6 Sizes:** S, M, L, XL, 2XL, 3XL
- **144 Variants** (3 products × 8 colours × 6 sizes)
- **3 Customers:** Wholesale Co., Retail Star, Fashion Hub
- **Opening stock** for various products
- **2 Sample orders** (one confirmed, one draft)

---

## Common Commands

```bash
# Start server
npm start

# Run all tests
npm test

# Watch tests during development
npm run test:watch

# Seed minimal data
npm run seed

# Seed demo data
npm run seed:demo

# Backup database (while server is running)
npm run backup

# Verify stock ledger integrity
npm run verify-ledger
```

---

## Access from Other Computers (Same Network)

1. Find your computer's IP address:
   - **Windows:** `ipconfig`
   - **Mac/Linux:** `ifconfig` or `ip addr`

2. From another computer on the same network, navigate to:
   **http://<your-ip>:4000**

   Example: http://192.168.1.100:4000

3. If you can't connect, check:
   - Server is running
   - HOST is set to 0.0.0.0 (not localhost)
   - Firewall allows port 4000

---

## Stop the Server

Press **Ctrl+C** in the terminal where the server is running.

The database will be safely closed.

---

## Resetting the Database

⚠️ **Warning:** This deletes all data.

```bash
# Stop server first (Ctrl+C)

# Delete database files
rm data/data.db data/data.db-wal data/data.db-shm

# Or on Windows:
# del data\data.db data\data.db-wal data\data.db-shm

# Re-initialize
npm run migrate
npm run seed:demo
npm start
```

---

## Next Steps

1. **Read the Documentation:**
   - PROJECT-SUMMARY.md - System overview
   - PLAN.md - Full specification
   - DECISIONS.md - Business rules

2. **Explore the UI:**
   - Try creating orders
   - Process deliveries
   - Generate invoices
   - Record payments

3. **Customize for Your Business:**
   - Add your products and prices
   - Add your customers
   - Enter opening stock balances
   - Start taking real orders

---

## Need Help?

- **Troubleshooting:** See DEPLOYMENT-CHECKLIST.md
- **Business Rules:** See DECISIONS.md
- **API Reference:** See src/http/routes/ for endpoints
- **Tests:** Run `npm test` to see all functionality verified

---

**Happy Manufacturing! 🏭**

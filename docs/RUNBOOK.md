# Garment Factory Management System — Operations Runbook

See [Scaling & SaaS Roadmap](SCALING.md) for multi-tenant, cloud, and multi-user scaling instructions.

## 1. System Requirements

- **Node.js**: `v22.6.0` or higher (enables native type stripping and embedded SQLite).
- **OS**: Windows, macOS, or Linux.
- **Dependencies**: Zero external npm dependencies for the backend.

---

## 2. Server Operations

### Starting the Application
```bash
npm start
```
- Applies any pending database migrations automatically on boot.
- Initializes database at `data/garment.db` (or custom path via `GARMENT_DB_PATH`).
- Listens on `http://localhost:3000` (configurable via `GARMENT_PORT` and `GARMENT_HOST`).

### Running Migrations Manually
```bash
npm run migrate
```

### Seeding Master Data & Demo Catalogue
- Create owner account only:
  ```bash
  npm run seed
  ```
- Create owner account + demo jacket catalogue and initial stock:
  ```bash
  npm run seed:demo
  ```

---

## 3. Testing & Verification

### Running Test Suite
```bash
npm test
```
Executes all unit tests (`tests/unit/`) and integration tests (`tests/integration/`) using Node's native test runner (`node:test`).

### Verifying Ledger Integrity
```bash
npm run verify-ledger
```
Audits all `stock_movements`, reconciling computed on-hand and active reservations against variant minimums and ensuring non-negative balances.

---

## 4. Backup & Disaster Recovery

### Creating a Hot Backup
The system uses SQLite `VACUUM INTO`, which is completely safe while the database is actively being written to.
```bash
npm run backup
```
- Creates a timestamped backup in `data/backups/garment-YYYY-MM-DD-HHmm.db`.
- Verified to produce an uncorrupted SQLite snapshot.

### Disaster Recovery / Restoration Drill
1. Stop the running server:
   `Ctrl+C` or terminate the Node process.
2. Archive the current corrupted/old database:
   ```powershell
   Move-Item -Path "data/garment.db" -Destination "data/garment-corrupt.db"
   ```
3. Copy the desired backup into place:
   ```powershell
   Copy-Item -Path "data/backups/garment-YYYY-MM-DD-HHmm.db" -Destination "data/garment.db"
   ```
4. Verify database integrity:
   ```bash
   npm run verify-ledger
   ```
5. Restart the server:
   ```bash
   npm start
   ```

---

## 5. Troubleshooting & Diagnostics

- **Database Locked (`SQLITE_BUSY`)**:
  - The SQLite driver is configured with WAL mode and `PRAGMA busy_timeout = 5000`. Ensure transactions are short and no external GUI locks the database file indefinitely.
- **Port Conflict**:
  - Set an alternate port: `$env:GARMENT_PORT="3001"; npm start`.

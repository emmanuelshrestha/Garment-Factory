# Deployment Guide: Garment Factory System

This system is engineered for local factory LAN deployment on a dedicated machine
using Node.js (>= 22.6.0) and SQLite (WAL mode).

---

## 1. Environment Configuration

The server reads configuration from the environment with backwards-compatible fallbacks.

| Canonical Variable | Legacy Variable | Default | Required in Production | Description |
| :--- | :--- | :--- | :--- | :--- |
| \`HOST\` | \`GARMENT_HOST\` | \`0.0.0.0\` | No | Network interface to bind. Use \`0.0.0.0\` for factory LAN. |
| \`PORT\` | \`GARMENT_PORT\` | \`4000\` | No | HTTP port for the web server and API. |
| \`DATABASE_PATH\` | \`GARMENT_DB_PATH\` / \`GARMENT_DB\` | \`data/garment.db\` | No | Absolute or relative path to the SQLite database file. |
| \`SESSION_SECRET\` | None | Generated in dev | **YES (min 32 chars)** | Secret used for session integrity. The server refuses to start in production if it is missing or shorter than 32 characters. |
| \`BACKUP_DIR\` | \`GARMENT_BACKUP_DIR\` | \`data/backups\` | No | Directory where automated database snapshots land. |
| \`BACKUP_KEEP_DAYS\` | \`GARMENT_BACKUP_KEEP_DAYS\` | \`30\` | No | Days to retain snapshot backups before auto-pruning. |
| \`NODE_ENV\` | None | \`development\` | Recommended (\`production\`) | Enforces auth checks, secure cookie flags, and secret requirements. |

### Auth is not bypassable in production

\`GARMENT_REQUIRE_AUTH=0\` is **ignored** when \`NODE_ENV=production\`. Production
always requires authentication, regardless of that variable. Outside production,
auth is opt-in (\`GARMENT_REQUIRE_AUTH=1\`) so integration tests and local
development can run unauthenticated.

### Cookie security

When \`NODE_ENV=production\` (or \`COOKIE_SECURE=1\`), the session cookie is issued
with \`HttpOnly\`, \`SameSite=Lax\`, \`Path=/\`, and \`Secure\`. If you terminate TLS
in front of the app, keep \`COOKIE_SECURE=1\`.

---

## 2. Production Deployment Options

### Option A: Linux systemd (Recommended)

1. **Install Node.js 22 LTS**

   \`\`\`bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs
   node --version   # must be >= 22.6.0
   \`\`\`

2. **Create a service user and deploy the code**

   \`\`\`bash
   sudo useradd --system --home /opt/garment-factory --shell /usr/sbin/nologin garment
   sudo mkdir -p /opt/garment-factory
   sudo chown garment:garment /opt/garment-factory
   sudo -u garment git clone <repo-url> /opt/garment-factory
   \`\`\`

3. **Build the frontend on the host** (the \`dist/\` output is compiled here, not committed)

   \`\`\`bash
   cd /opt/garment-factory
   sudo -u garment npm --prefix frontend ci
   sudo -u garment npm --prefix frontend run build
   \`\`\`

4. **Configure the environment**

   \`\`\`bash
   sudo tee /etc/garment-factory.env > /dev/null <<'ENVEOF'
   NODE_ENV=production
   HOST=0.0.0.0
   PORT=4000
   DATABASE_PATH=/opt/garment-factory/data/garment.db
   BACKUP_DIR=/opt/garment-factory/data/backups
   BACKUP_KEEP_DAYS=30
   SESSION_SECRET=replace-with-64-hex-chars-from-openssl-rand-hex-32
   ENVEOF
   sudo chmod 600 /etc/garment-factory.env
   \`\`\`

   Generate the secret with:

   \`\`\`bash
   openssl rand -hex 32
   \`\`\`

5. **Install and start the service**

   \`\`\`bash
   sudo cp deploy/garment.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now garment
   sudo systemctl status garment
   journalctl -u garment -f
   \`\`\`

6. **Install the nightly backup timer**

   \`\`\`bash
   sudo cp deploy/garment-backup.service deploy/garment-backup.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now garment-backup.timer
   systemctl list-timers garment-backup.timer
   \`\`\`

   The timer fires at midnight local time (\`OnCalendar=*-*-* 00:00:00\`) with
   \`Persistent=true\` (catches up after downtime) and a randomised 5-minute delay.

   If you prefer cron over systemd timers:

   \`\`\`bash
   sudo cp deploy/garment-backup.cron /etc/cron.d/garment-backup
   sudo chmod 644 /etc/cron.d/garment-backup
   \`\`\`

### Option B: PM2

The repo ships \`ecosystem.config.cjs\` at the project root. It must stay \`.cjs\`
because the root \`package.json\` declares \`"type": "module"\`.

\`\`\`bash
npm install -g pm2
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup    # follow the printed command to enable boot start
pm2 logs garment
\`\`\`

The PM2 config pins \`instances: 1\` and \`exec_mode: fork\` deliberately: SQLite is
a single-writer database, so multiple Node processes against the same file will
cause lock contention and \`SQLITE_BUSY\` errors under load. Scale vertically, not
by adding instances.

Graceful shutdown: the process listens for \`SIGTERM\`/\`SIGINT\`, stops accepting
connections, drains in-flight requests (10 s), checkpoints the WAL, and closes
the database. \`kill_timeout\` is 15 s and \`TimeoutStopSec\` is 20 s so the drain
always completes before the supervisor escalates to \`SIGKILL\`.

### Option C: Docker

\`\`\`dockerfile
FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm --prefix frontend ci && npm --prefix frontend run build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
VOLUME ["/app/data"]
EXPOSE 4000
CMD ["node", "backend/src/main.ts"]
\`\`\`

Mount a named volume at \`/app/data\` so the database and backups survive
container replacement. Back up from the host, not from inside a container that
may be removed.

---

## 3. Database Migrations and Seeding

\`\`\`bash
npm --prefix backend run migrate        # apply schema migrations
npm --prefix backend run seed           # seed reference data
npm --prefix backend run seed:demo      # optional demo dataset
npm --prefix backend run create-tenant  # provision a tenant
npm --prefix backend run list-tenants   # inspect tenants
npm --prefix backend run verify-ledger  # audit the append-only stock ledger
\`\`\`

---

## 4. Backups

Backups use \`VACUUM INTO\`, which produces a consistent, defragmented snapshot
of a live database without stopping the server.

- **Default location:** \`BACKUP_DIR\`, which defaults to \`<DATA_DIR>/backups/\`.
  With the default \`DATABASE_PATH\`, that is \`data/backups/\`.
- **Filename format:** \`backup-YYYY-MM-DD_HHmmss.db\` (local time). Two backups
  started in the same second get a \`-2\`, \`-3\`, ... suffix rather than colliding.
- **Retention:** 30 days by default (\`BACKUP_KEEP_DAYS\`). The pruner only deletes
  files matching \`backup-*.db\` older than the cutoff, and never deletes the
  snapshot it just wrote.

Manual run:

\`\`\`bash
npm --prefix backend run backup
npm --prefix backend run backup -- --keep 7        # override retention
npm --prefix backend run backup -- --no-prune      # snapshot without pruning
npm --prefix backend run backup -- --dir /mnt/nas  # write elsewhere
\`\`\`

**Retention on the same disk is not a backup strategy.** A snapshot in
\`data/backups/\` protects against application-level corruption and accidental
deletes, but not against disk failure, filesystem corruption, or ransomware. Copy
\`BACKUP_DIR\` to a separate machine or NAS on a schedule:

\`\`\`bash
# /etc/cron.d/garment-offsite
0 1 * * * garment rsync -a --delete /opt/garment-factory/data/backups/ backup-host:/srv/garment/backups/
\`\`\`

Restore procedure:

\`\`\`bash
sudo systemctl stop garment
cp /opt/garment-factory/data/backups/backup-2026-10-29_000000.db \
   /opt/garment-factory/data/garment.db
rm -f /opt/garment-factory/data/garment.db-wal /opt/garment-factory/data/garment.db-shm
sudo systemctl start garment
\`\`\`

Always remove the \`-wal\` and \`-shm\` sidecar files when swapping in a snapshot;
a stale WAL replayed against a different database will corrupt it.

---

## 5. Verification

\`\`\`bash
curl -sI http://localhost:4000/ | grep -Ei 'x-content-type|x-frame|referrer'
\`\`\`

Expected:

\`\`\`
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
\`\`\`

Run the test suite:

\`\`\`bash
npm --prefix backend test
\`\`\`

---

## 6. Operating Notes

- **Single writer.** One Node process per SQLite file. Do not run two PM2
  instances or two systemd units against the same \`DATABASE_PATH\`.
- **Disk headroom.** \`VACUUM INTO\` needs free space roughly equal to the database
  size. Keep at least 2x the database size free.
- **Logs.** \`journalctl -u garment\` under systemd, \`pm2 logs garment\` under PM2.
- **Health check.** Point your monitor at \`GET /\` on the configured port; a
  healthy server returns 200 with the security headers above.

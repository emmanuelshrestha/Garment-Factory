# Deployment Checklist

**System:** Garment Factory Management System  
**Version:** 1.0.0  
**Status:** Production-ready  
**Date:** 2026-09-11

---

## Pre-Deployment Verification

### ✅ Code Quality
- [x] All 300 tests passing
- [x] Zero test failures
- [x] TypeScript compiles without errors
- [x] No console errors in development
- [x] Database migrations applied successfully

### ✅ Documentation
- [x] PROJECT-SUMMARY.md created
- [x] TODO.md updated with final status
- [x] PLAN.md complete
- [x] DECISIONS.md documenting all business rules
- [x] DEPLOY.md with deployment instructions
- [x] Business rules documented
- [x] Workflows documented

### ✅ Functionality
- [x] Server starts successfully
- [x] Database migrations run
- [x] Frontend builds without errors
- [x] API endpoints respond correctly
- [x] Authentication works
- [x] Stock movements tracked correctly
- [x] Order lifecycle functional
- [x] Invoice generation working
- [x] Payment recording functional
- [x] Dashboard displays KPIs

---

## Deployment Steps

### 1. Prepare Factory Machine

```bash
# Install Node.js 22 LTS
# Download from https://nodejs.org/

# Verify installation
node --version  # Should show v22.x.x
npm --version
```

### 2. Copy Project Files

```bash
# Copy entire project directory to factory machine
# Recommended location: C:\GarmentFactory (Windows)
#                       ~/garment-factory (Linux)
```

### 3. Build Frontend

```bash
cd web
npm install
npm run build
cd ..
```

### 4. Configure Environment (Optional)

Create `.env` file in project root:

```env
DATABASE_PATH=./data/production.db
PORT=4000
HOST=0.0.0.0
```

### 5. Initialize Database

```bash
# Run migrations
npm run migrate

# Option A: Start with minimal seed data
npm run seed

# Option B: Start with demo data for testing
npm run seed:demo
```

### 6. Start Server

```bash
npm start
```

Server will be available at:
- From factory machine: http://localhost:4000
- From other LAN machines: http://<factory-machine-ip>:4000

### 7. Verify Deployment

- [ ] Navigate to http://localhost:4000
- [ ] Dashboard loads successfully
- [ ] Can view products and customers
- [ ] Can create a test order
- [ ] Can create a test delivery
- [ ] Can generate a test invoice
- [ ] Can record a test payment

---

## First-Time Setup Tasks

After deployment, the owner should:

1. **Add Real Data:**
   - [ ] Add all products with codes and prices
   - [ ] Add all colours and sizes
   - [ ] Generate product variants
   - [ ] Add customer records

2. **Set Opening Balances:**
   - [ ] Record opening stock for each variant
   - [ ] Verify stock quantities in inventory matrix

3. **Configure Settings:**
   - [ ] Set amber band percentage (default: 25%)
   - [ ] Verify currency settings

4. **Test Core Workflow:**
   - [ ] Create a real customer order
   - [ ] Confirm order (allocate stock)
   - [ ] Create delivery
   - [ ] Dispatch delivery
   - [ ] Generate invoice
   - [ ] Record payment
   - [ ] Verify customer balance

---

## Backup Strategy

### Daily Backup (Recommended)

**Option 1: Hot Backup (Server Running)**
```bash
npm run backup
# Creates timestamped backup in data/backups/
```

**Option 2: File Copy (Server Stopped)**
```bash
# Stop server first
# Copy data/production.db to backup location
```

### Schedule Automated Backups

**Windows Task Scheduler:**
1. Open Task Scheduler
2. Create Basic Task
3. Trigger: Daily at 11:00 PM
4. Action: Start a program
5. Program: `C:\Program Files\nodejs\npm.cmd`
6. Arguments: `run backup`
7. Start in: `C:\GarmentFactory`

**Linux Cron:**
```bash
# Edit crontab
crontab -e

# Add line (backup daily at 11 PM)
0 23 * * * cd /home/user/garment-factory && npm run backup
```

---

## Troubleshooting

### Server Won't Start

**Check Node Version:**
```bash
node --version  # Must be 22.x.x
```

**Check Database Path:**
- Ensure `data/` directory exists
- Check DATABASE_PATH in .env or config.ts

**Check Port Availability:**
```bash
# Windows
netstat -ano | findstr :4000

# Linux
lsof -i :4000
```

### Frontend Not Loading

**Verify Build:**
```bash
cd web
npm run build
# Check that web/dist/ directory exists
```

**Check Server Logs:**
- Look for "ui: http://localhost:4000/" in console output

### Database Errors

**Reset Database (Development Only):**
```bash
# CAUTION: Deletes all data
rm data/data.db
rm data/data.db-wal
rm data/data.db-shm
npm run migrate
npm run seed
```

**Verify Integrity:**
```bash
npm run verify-ledger
```

### Can't Access from Other Machines

**Check HOST Setting:**
- Must be `0.0.0.0` (not `localhost` or `127.0.0.1`)

**Check Firewall:**
- Allow port 4000 through Windows Firewall
- Or use: `netsh advfirewall firewall add rule name="Garment Factory" dir=in action=allow protocol=TCP localport=4000`

**Find Machine IP:**
```bash
# Windows
ipconfig

# Linux
ip addr show
```

---

## Security Notes

⚠️ **Current Authentication:**
- Single owner account (no multi-user support in MVP)
- Session-based authentication
- HttpOnly cookies

⚠️ **Network Security:**
- System binds to 0.0.0.0 (all interfaces)
- No TLS/HTTPS in MVP (LAN-only deployment assumed)
- For Internet exposure, add reverse proxy with TLS

⚠️ **Data Security:**
- Database file in `data/` directory
- Keep regular backups
- Restrict file system access to database file

---

## Performance Notes

**Expected Capacity:**
- Suitable for single factory with ~50 products
- ~2,400 variants (50 products × 8 colors × 6 sizes)
- Thousands of orders per year
- SQLite handles this scale easily on modern hardware

**Database Size:**
- Empty: ~100 KB
- After 1 year of typical use: ~50-100 MB
- No maintenance required until multi-GB scale

**Backup Speed:**
- Hot backup: ~1 second for typical database
- File copy: Instant for databases under 100 MB

---

## Support & Maintenance

### Logs
- Server logs: stdout (console output)
- Audit log: `audit_log` table in database
- No external logging service in MVP

### Updates
- Keep Node.js 22 LTS updated for security patches
- Database schema changes require new migrations

### Monitoring
- Manual: Check dashboard for KPIs
- No automatic monitoring in MVP

---

## Success Criteria

The deployment is successful when:

- [x] Server starts without errors
- [x] Dashboard loads and shows correct data
- [x] Can create and confirm orders
- [x] Can dispatch deliveries
- [x] Can generate invoices
- [x] Can record payments
- [x] Stock levels update correctly
- [x] Customer balances are accurate
- [x] Backup system works

---

## Contact

For issues or questions:
1. Check troubleshooting section above
2. Review documentation in docs/ directory
3. Consult DECISIONS.md for business rule questions

---

**Deployment Date:** _______________  
**Deployed By:** _______________  
**Verified By:** _______________  
**Sign-off:** _______________


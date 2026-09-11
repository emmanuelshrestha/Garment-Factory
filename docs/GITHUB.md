# GitHub presence playbook

How to publish this project so it is the strongest repository on your profile — the one people open, the one you pin, the one that explains how you think about software.

This file is the checklist. The README is the landing page. Screenshots are the proof.

---

## 1. Decide public vs private

| Choice | When |
|---|---|
| **Public** | You want this to be a portfolio piece. Strip live factory data. Keep `LICENSE` as written. |
| **Private** | The factory’s real customers, prices, or cheque history would leak. Still write the README; pin it on a private profile or a public *mirror* with demo data only. |

**Never commit** `data/*.db`, `data/backups/`, `.env`, `web/dist/`, `node_modules/`, or `data.db` at the repo root. `.gitignore` already covers the live database; check `git status` before the first push.

Recommended public name:

```
garment-factory-os
```

Alternatives: `garment-factory`, `factory-ledger`, `jacket-factory-erp`.
Avoid `erp`, `project1`, `backend`, `final-year`.

---

## 2. Repository **About** box (the 350-character blurb)

Paste this into GitHub → repo → ⚙️ About → Description:

```
Production-grade OS for a jacket factory: colour×size stock ledger, reservations, immutable invoices, and cheque-aware payments. Node 22 + SQLite, zero backend npm dependencies, React 19 UI.
```

Shorter variant (if you want it to wrap on one line in profile pins):

```
Jacket-factory ledgers: integer money, append-only stock, void-and-reissue invoices. Node 22 / SQLite / React 19.
```

- **Website:** leave empty, or your deployed demo if you ever host one. Do not put `http://localhost:4000`.
- **Topics** (add all of these):

  ```
  typescript
  nodejs
  sqlite
  react
  erp
  inventory-management
  accounting
  garment
  manufacturing
  ledger
  zero-dependency
  factory
  nepal
  invoicing
  ```

- Tick **Releases** / **Packages** only when you tag `v1.0.0`.
- Tick **Include in the home page** if this should be the first thing on your profile.

---

## 3. GitHub **profile bio** (the 160-character line)

This is the line under your avatar, not the repo. Write it so this project is the obvious click.

**Primary (recommended):**

```
I build systems where money and stock are not allowed to be wrong. TypeScript, ledgers, SQLite.
```

**Alternates, pick one:**

```
Factory software, not CRUD. Integer money, append-only stock, immutable invoices.
```

```
Backend engineer. Production garment OS in Node 22 + SQLite (0 npm deps) + React 19.
```

```
Ledgers for the real world — jackets, cheques, NPR/INR/USD.
```

**Profile README** (`username/username` repo), one block you can paste:

```markdown
### Currently
Building **[Garment Factory OS](https://github.com/<you>/garment-factory-os)** — a production ledger for a jacket factory:
orders → reservations → dispatch → immutable invoices → cheque-aware payments.

Integer minor units. Append-only stock. Zero backend dependencies.
```

---

## 4. Pin order on your profile

Pin **this repo first**. Then at most five others. A profile with this as #1 and a graveyard of half-finished tutorials underneath will still lose. Hide or archive the weak ones.

Suggested pin captions (GitHub uses the About description, so get §2 right).

---

## 5. First-push checklist (Windows)

From the project root. Do this **after** screenshots are in `docs/assets/` if you can; a README with broken image links looks worse than no images. Until then, the SVG social preview is enough.

```powershell
# 1. Confirm you will not leak the factory
git status
# Reject: data.db, data/*.db, .env, web/dist, node_modules, debug_*.js

# 2. Identity (once per machine)
git config user.name  "Your Name"
git config user.email "your@email"

# 3. Commit what is already on master plus the docs
git add README.md LICENSE CONTRIBUTING.md SECURITY.md
git add docs .github
git add -A
git status   # read it

git commit -m "docs: GitHub landing page, API reference, and screenshot recipe"

# 4. Create the empty repo on GitHub (no README, no license — this tree has both)
#    then:

git branch -M main
git remote add origin https://github.com/<you>/garment-factory-os.git
git push -u origin main
```

If GitHub already created a README on the website, pull `--rebase` once or force-push only if you own the remote and it is empty of unique work.

After the push:

1. Settings → General → **Social preview** → upload `docs/assets/social-preview.png` (1280×640).
2. Settings → General → Features: enable Issues if you want a public tracker; disable Wiki (the `docs/` folder is the wiki).
3. Releases → Draft `v1.0.0` with the notes in §8.
4. Pin the repo on your profile.

---

## 6. Commit hygiene that reads well on GitHub

This repo already has a real history (`Phase 0` → stock ledger → orders → deliveries → invoices). Keep it.

Good:

```
Stock ledger: the single writer of stock movements
Invoices: delivered goods become money owed
```

Bad (do not squash the whole project into):

```
update
final
asdjkl
Add files via upload
```

If you have a pile of uncommitted work, make **thematic** commits (docs, payments, cutting stock, employees) rather than one 10,000-file dump. Reviewers skim `git log`.

---

## 7. What a visitor sees in ten seconds

You win or lose here.

| Second | They look at | You need |
|---|---|---|
| 0–2 | Social preview + repo name | `garment-factory-os` + the 1280×640 card |
| 2–5 | README hero + one-liner | “not a CRUD demo” + badges that are true |
| 5–10 | First screenshot | Dashboard or stock matrix with **real numbers** |
| 10–30 | Architecture + rules table | Proof you understand ledgers |
| 30–60 | Quick start | They could run it |
| later | `DECISIONS.md`, tests, `src/domain/money.ts` | This is where you get hired |

If the first screen is a wall of emoji and “300/300 tests” with no picture, they leave.

---

## 8. Release notes for `v1.0.0`

Title: `v1.0.0 — Sales, stock, invoices, payments`

```markdown
## Garment Factory OS 1.0

A single-factory ledger for jacket manufacturing.

### In
- Colour × size catalogue with variant price overrides
- Append-only finished-stock ledger (no cached quantity)
- Order confirmation as reservation, delivery as the stock movement
- Immutable invoices (void-and-reissue)
- Cash / bank / cheque lifecycle, per-currency statements
- Cutting-stock ledger (separate from finished goods)
- Expenses, purchases, employee earnings
- React 19 UI served by a zero-dependency Node 22 + SQLite backend

### Not in
- Full shop-floor production (cut → sew → QC → pack)
- Multi-warehouse, multi-tenant SaaS
- Customer returns after dispatch (refused until a business rule is chosen)

### Run
Node 22.6+. See README quick start.
```

---

## 9. README badges that stay honest

Keep:

- Node 22, TypeScript, SQLite, 0 backend deps, React 19

Add only after CI is green on GitHub:

```markdown
![CI](https://github.com/<you>/garment-factory-os/actions/workflows/ci.yml/badge.svg)
```

Do **not** invent a test-count badge you have not just run. Do **not** add a “production-ready” badge. The README already says what is in and what is not.

---

## 10. How to talk about this project (LinkedIn, resume, interviews)

**One sentence:**
> I designed and built a garment-factory operating system whose stock and money paths are ledgers, not cached fields — integer minor units, append-only movements, immutable invoices, and a cheque lifecycle that does not pretend pending paper is cash.

**Three bullets for a resume:**

- Modelled finished-goods inventory as an append-only SQLite ledger; order confirmation reserves, dispatch is the only outbound movement; on-hand is `SUM(qty_delta)`.
- Implemented integer-minor-unit money (NPR/INR/USD) with document-time FX, void-and-reissue invoicing, and cheque pending → cleared / bounced without rewriting history.
- Zero-dependency Node 22 backend (`node:sqlite`, `node:http`, `node:test`) plus a React 19 / Vite / Tailwind operator UI; domain layer is pure TypeScript and independently tested.

**What to open in an interview:** `src/domain/money.ts`, `src/services/stock.ts`, `DECISIONS.md` D004 / D007 / D021 / D028, then the stock matrix screenshot.

---

## 11. After it is public — a little, not a lot

- Watch the first GitHub Issues for “how do I run this” — that is a README bug.
- Do not farm stars. One good Show HN / Reddit r/typescript / r/node post with the stock-matrix screenshot beats 50 tag spam.
- If you write a post, lead with **D004** (allocation is not a movement) or **pending cheques are not money**. Those are the ideas people remember.

Post skeleton:

```
Title: Your ERP is a cached integer. This factory uses a ledger.

1. The bug: UPDATE products SET stock = stock - 1
2. The rule: available = on_hand - allocations; on_hand = SUM(movements)
3. Screenshot of the colour × size matrix
4. Cheques: pending does not reduce receivables
5. Link to the repo
```

---

## 12. Files this playbook expects to exist

| Path | Role |
|---|---|
| `README.md` | Landing page |
| `docs/SCREENSHOTS.md` | Capture recipe |
| `docs/API.md` | HTTP surface |
| `docs/assets/social-preview.svg` | Default hero; export PNG for Settings |
| `LICENSE` | Terms |
| `CONTRIBUTING.md` | How to touch a ledger |
| `SECURITY.md` | Bind address, secrets, disclosure |
| `.github/workflows/ci.yml` | `npm test` on Node 22 |

When the PNGs land in `docs/assets/`, the README image table lights up without any further edit.

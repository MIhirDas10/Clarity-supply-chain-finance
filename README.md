# Clarity — B2B Invoice Discounting & Supply Chain Finance Platform

A single, unified codebase that merges the work of all four group members into one
running system. It has **one base** with two folders:

- **`client/`** — the React (Vite) frontend, one app with one sidebar.
- **`server/`** — the Express backend, one API on port 5000.

> Course: CSE471 — System Analysis and Design · Group 4 · Lab Section 9

---

## What each member built (all live in the one app)

| Member | Feature | Where in the code | API it uses |
|--------|---------|-------------------|-------------|
| **Mihir** | Invoice Status **Pipeline Tracker** | `client/src/mihir/` | `GET/PATCH /api/pipeline/invoices` (Supabase) |
| **Apurba** | Invoice **Upload (OCR)**, **My Invoices**, **Payout History** + CSV | `client/src/apurba/` | `GET/POST /api/invoices`, `GET /api/payouts` (pg) |
| **Digonto** | Real-Time **Discount Rate Calculator** | `client/src/digonto/` | `GET/POST /api/invoices` (pg) |
| **Ameet** | **Cash Flow Forecast**, Buyer-Funded **Dynamic Discounting**, **Repayment Calendar**, and **Repayment & Settlement** | `client/src/ameet/` | `GET /api/cashflow/forecast`, `GET/POST/PATCH /api/dynamic-discounting`, `GET/POST /api/settlements`, `GET/POST /api/calendar` (pg + Google Calendar) |

Each member's original source lives in its **own subfolder** and was kept intact.
Only the "glue" that joins them (the sidebar/router, API base URLs, and a merged
database schema) was added.

---

## How it fits together

```
                 ┌─────────────────────────────────────────────┐
   Browser ────► │  client/  (Vite React, one sidebar/router)  │
                 └───────────────┬─────────────────────────────┘
                                 │  /api/*  (Vite dev proxy → :5000)
                 ┌───────────────▼─────────────────────────────┐
                 │  server/  (one Express app, port 5000)       │
                 │   /api/invoices, /api/payouts   → pg         │
                 │   /api/pipeline/invoices        → Supabase   │
                 │   /api/cashflow, /api/settlements → pg       │
                 │   /api/calendar → Google Calendar + pg      │
                 └───────────────┬─────────────────────────────┘
                                 │
                 ┌───────────────▼─────────────────────────────┐
                 │  One Supabase PostgreSQL database            │
                 │  invoices (+ number/amount/status synced by  │
                 │  a trigger) · invoice_history · funders ...  │
                 └─────────────────────────────────────────────┘
```

Both data layers (raw `pg` and the Supabase client) point at the **same** Supabase
database, so every feature reads and writes the same invoices. A database trigger
keeps the different column names the members used (`invoice_number`/`number`,
`invoice_amount`/`amount`, `status`/`current_stage`) in sync automatically.

---

## Running it

### 1. Prerequisites
- Node.js v18+
- A Supabase project (free tier is fine)

### 2. Configure the server
```bash
cp server/.env.example server/.env
```
Then edit `server/.env` and fill in:
- `DATABASE_URL` — Supabase → Project Settings → Database → Connection string (Session pooler)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API

### 3. Install everything
```bash
npm run install:all
```

### 4. Create the tables + sample data (run once)
```bash
npm run setup
```

### 5. Start the server and client (two terminals)
The server and client run separately. Open two terminals in this folder:

```bash
npm run dev:server
```
```bash
npm run dev:client
```
- Client: http://localhost:5173
- API: http://localhost:5000  ·  API docs: http://localhost:5000/api-docs

---

## Folder map

```
Clarity/
├── client/                 # one React app
│   └── src/
│       ├── App.tsx         # router + layout (glue)
│       ├── main.tsx        # entry + shared CSS (glue)
│       ├── components/     # unified Sidebar + Header (glue)
│       ├── digonto/        # Digonto's Discount Calculator (InvoiceForm + page)
│       ├── ameet/          # Ameet's Forecast / Discounting / Settlement / Calendar
│       ├── mihir/          # Mihir's Pipeline Tracker
│       └── apurba/         # Apurba's Upload / My Invoices / Payout History
├── server/                 # one Express API
│   ├── index.js            # entry: mounts every route (glue)
│   ├── routes/             # member feature routes (Apurba, Ameet, Digonto, Mihir)
│   ├── controllers/        # Mihir's pipeline controller
│   ├── config/ services/   # Mihir's Supabase client + SMS stub
│   ├── db.js               # Apurba's pg pool
│   ├── sql/                # schema.sql + seed.sql
│   └── setup.js            # creates tables and loads sample data
└── docs/                   # assignment (functional requirements) doc
```

Each member's feature code lives in its own subfolder. The full original,
untouched branches are kept separately outside this project in `../our code/`.

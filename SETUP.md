# Payout History and Transaction Records

Module 1 (Supplier Portal) feature — Apurba Roy, 23101012.

A supplier sees a permanent ledger of **every invoice they have ever submitted**
to Clarity — funded or not. Each row shows the original invoice amount, what they
actually received, the discount they paid, which funder backed it, and the payment
date. Invoices still moving through the pipeline show their status and leave the
payout columns blank. The whole ledger can be downloaded as a CSV file.

---

## Running it on a fresh PC

**You need:** Node.js. For the database, pick **either** option A or option B.

### Option A — Supabase (nothing to install)

Best when demoing on a PC that is not yours. Needs working internet.

1. At [supabase.com](https://supabase.com) create a project. Pick the **Singapore**
   or **Mumbai** region (closest to Bangladesh) and set a database password.
2. Go to **Project Settings → Database → Connection string**. Copy the
   **Session pooler** URI — its host contains `pooler.supabase.com`. Replace
   `[YOUR-PASSWORD]` with your real password.

   Do not use the **Direct connection** URI (host `db.xxxxx.supabase.co`). On
   free projects that address is IPv6-only and usually fails on campus Wi-Fi.
3. Create a file `server/.env` containing that one line:

   ```
   DATABASE_URL=postgresql://postgres.xxxxx:YOURPASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```

   `server/.env.example` shows the format. `.env` is in `.gitignore`, so the
   password is never pushed to GitHub.

No database needs creating — Supabase gives you one called `postgres` already.

### Option B — PostgreSQL installed on this PC

Best when the internet is unreliable. Install PostgreSQL from
[postgresql.org](https://www.postgresql.org/download/windows/), noting the
password you set during installation.

1. Open pgAdmin → right-click **Databases** → **Create** → **Database** →
   name it `clarity` → Save.
2. If the password you set is not `postgres`, change this line in `server/db.js`:

   ```js
   const LOCAL_CONNECTION = 'postgresql://postgres:postgres@localhost:5432/clarity';
   //                                     user     password  host      port  database
   ```

Do **not** create a `.env` file for this option — without one, `db.js` falls back
to the line above automatically.

### Start the backend

```bash
cd server
npm install
npm run setup     # creates the tables and inserts 12 sample payouts
npm run dev       # starts the API on http://localhost:4000
```

`npm run setup` should print `Invoice rows in database: 17`.

> On Supabase you can skip `npm run setup` and instead paste `schema.sql` then
> `seed.sql` into the Supabase **SQL Editor** in your browser. Same result, and
> afterwards the **Table Editor** shows your 12 rows sitting in a real cloud
> database — which is a convincing thing to show alongside the app.

### Start the frontend

In a **second terminal**:

```bash
cd client
npm install
npm run dev       # opens on http://localhost:5173
```

Both terminals must stay open. Visit <http://localhost:5173>.

---

## What to show

1. The page loads with three summary cards and a table of 17 invoices, each with
   a coloured status chip. 12 are Completed; the rest are still moving through
   the pipeline and show a dash where the payout would be.
2. Click **Download CSV** — a `payout-history.csv` file downloads and opens in Excel.
3. Open `http://localhost:4000/api/payouts?supplierId=1` in the browser to show
   the raw JSON the backend returns. This proves the table is real data from the
   database, not hardcoded in the frontend.

---

## How the three layers connect

```
  Browser                    Backend                     Database
  ───────                    ───────                     ────────
  PayoutHistory.jsx          server/index.js             invoices
    fetch()        ────────►   GET /api/payouts  ──────►  LEFT JOIN funders
                   ◄────────   sends JSON back   ◄──────  17 rows
    renders table
```

| File | What it does |
| --- | --- |
| `server/schema.sql` | Creates the 3 tables: `suppliers`, `funders`, `invoices` |
| `server/seed.sql` | Inserts 1 supplier, 4 funders, 17 invoice rows |
| `server/db.js` | Opens the connection to PostgreSQL |
| `server/setup.js` | Runs schema.sql then seed.sql |
| `server/index.js` | The API — one SQL query, two endpoints |
| `client/src/PayoutHistory.jsx` | Fetches the data and draws the table |
| `client/src/styles.css` | Dark theme with teal accent, from the Figma design |

---

## Answers to likely questions

**Why is the discount not stored in the database?**
Because it is always `invoice_amount - payout_amount`. If it were stored as its
own column, someone could update one value and not the other, and the row would
contradict itself. It is calculated inside the SELECT query instead.

**Why a LEFT JOIN and not a normal JOIN?**
The ledger has to list every invoice ever submitted. A normal JOIN only keeps
rows that have a match in the funders table, so every invoice still waiting for
a funder would silently disappear from the ledger. LEFT JOIN keeps those rows and
leaves the funder name empty.

**Why are `payout_amount` and `funder_id` allowed to be empty?**
Because an invoice that was submitted yesterday has not been funded yet — there
is genuinely no payout and no funder to record. Only the columns that are true
the moment an invoice is submitted are marked NOT NULL.

**Why do you JOIN the funders table?**
The `payouts` table only stores `funder_id`, a number. The JOIN swaps that number
for the funder's actual name so the table can display "City Bank PLC" instead of
"1". Storing the name in every payout row would repeat the same text many times.

**Why `$1` instead of putting the supplier id straight into the SQL?**
`$1` is a parameter. PostgreSQL keeps it separate from the query text, so a user
cannot inject their own SQL through it. Building the string by hand would be an
SQL injection risk.

**Why are amounts converted with `Number()` in the frontend?**
PostgreSQL `NUMERIC` columns arrive in JavaScript as strings, so that decimals are
never rounded off in transit. `Number()` converts them before the totals are added
up — without it, `+` would join the strings instead of adding them.

**What makes the CSV download instead of showing on screen?**
The `Content-Disposition: attachment` header in `server/index.js`. That header is
what tells the browser to save the response as a file.

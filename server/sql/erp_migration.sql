-- ===========================================================================
--  ERP / Accounting Integration (Google Sheets)  - Mihir Das (SL 2), Module 2
--
--  Syncs the platform's invoice lifecycle into a buyer's accounts-payable
--  ledger. erp_ledger is the always-on local mirror the UI renders in real
--  time; when the buyer connects Google Sheets it is also pushed to their real
--  spreadsheet. erp_sync_log is the audit trail. Non-destructive, safe to re-run.
-- ===========================================================================

-- One connection per buyer. mode = 'local' (in-app ledger only) or 'google'
-- (also mirrored to a real Google Sheet). OAuth columns mirror calendar_connections.
CREATE TABLE IF NOT EXISTS erp_connections (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL DEFAULT 'google-sheets',
  mode           TEXT NOT NULL DEFAULT 'local',
  access_token   TEXT,
  refresh_token  TEXT,
  token_type     TEXT DEFAULT 'Bearer',
  scope          TEXT,
  expires_at     TIMESTAMPTZ,
  oauth_state    TEXT UNIQUE,
  spreadsheet_id TEXT,
  ap_sheet       TEXT DEFAULT 'Accounts Payable',
  supplier_sheet TEXT DEFAULT 'Suppliers',
  delete_on_dispute BOOLEAN NOT NULL DEFAULT FALSE,
  status         TEXT NOT NULL DEFAULT 'Active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_google_sync_at TIMESTAMPTZ,
  last_google_error   TEXT,
  UNIQUE (user_id, provider)
);

-- The local accounts-payable mirror: one row per invoice, kept in lock-step with
-- the invoice's live state. This is what the buyer's ERP page renders.
CREATE TABLE IF NOT EXISTS erp_ledger (
  id               SERIAL PRIMARY KEY,
  buyer_name       TEXT NOT NULL,
  invoice_id       TEXT NOT NULL,
  invoice_number   TEXT,
  supplier_name    TEXT,
  amount           NUMERIC(14, 2),
  payout_amount    NUMERIC(14, 2),
  due_date         DATE,
  erp_status       TEXT NOT NULL,
  sheet_row        INTEGER,
  synced_to_google BOOLEAN NOT NULL DEFAULT FALSE,
  po_number        TEXT,
  gl_code          TEXT,
  department       TEXT,
  payment_terms    TEXT,
  tax_amount       NUMERIC(14, 2),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_erp_ledger_buyer ON erp_ledger (LOWER(buyer_name));
CREATE INDEX IF NOT EXISTS idx_erp_ledger_buyer_status_due ON erp_ledger (LOWER(buyer_name), erp_status, due_date);

-- Every sync action, so the buyer can see exactly what was pushed and when.
CREATE TABLE IF NOT EXISTS erp_sync_log (
  id             SERIAL PRIMARY KEY,
  buyer_name     TEXT,
  invoice_id     TEXT,
  invoice_number TEXT,
  action         TEXT NOT NULL,
  erp_status     TEXT,
  target         TEXT NOT NULL DEFAULT 'local',
  status         TEXT NOT NULL,
  detail         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_sync_log_buyer ON erp_sync_log (LOWER(buyer_name), created_at DESC);

-- CRUD: manual payables the buyer adds directly (not from a platform invoice).
ALTER TABLE erp_ledger ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE erp_ledger ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE erp_ledger ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE erp_ledger ADD COLUMN IF NOT EXISTS gl_code TEXT;
ALTER TABLE erp_ledger ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE erp_ledger ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE erp_ledger ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14, 2);
ALTER TABLE erp_connections ADD COLUMN IF NOT EXISTS last_google_sync_at TIMESTAMPTZ;
ALTER TABLE erp_connections ADD COLUMN IF NOT EXISTS last_google_error TEXT;

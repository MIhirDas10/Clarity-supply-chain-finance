-- Clarity - database schema for Invoice Upload + Payout History
-- Run this with:  npm run setup
--
-- The Supabase database is SHARED with the rest of the group, so this file
-- never drops anything. "IF NOT EXISTS" everywhere means running it again is
-- harmless: it creates only what is missing and leaves existing data alone.
--
-- To wipe everything and start over, see reset.sql - read the warning first.

CREATE TABLE IF NOT EXISTS suppliers (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS funders (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

-- One row = one invoice the supplier submitted, whatever happened to it after.
--
-- The first six columns are filled in when the invoice is uploaded. The last
-- three stay empty until a funder takes the invoice on and pays out, so they
-- are nullable - an invoice submitted this morning genuinely has no funder.
CREATE TABLE IF NOT EXISTS invoices (
  id             SERIAL PRIMARY KEY,
  supplier_id    INTEGER REFERENCES suppliers(id),
  buyer_name     TEXT,                     -- read off the invoice by OCR
  invoice_number TEXT,                     -- read off the invoice by OCR
  invoice_amount NUMERIC(12, 2),           -- read off the invoice by OCR
  due_date       DATE,                     -- read off the invoice by OCR
  submitted_date DATE,
  status         TEXT,
  file_name      TEXT,
  funder_id      INTEGER REFERENCES funders(id),
  payout_amount  NUMERIC(12, 2),
  payment_date   DATE
);

-- If the invoices table already existed (another member created their own
-- version), these add any columns it is missing. Adding a column never
-- deletes data, so this is safe to run on the shared database.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supplier_id    INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_name     TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC(12, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date       DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS submitted_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status         TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_name      TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS funder_id      INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payout_amount  NUMERIC(12, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_date   DATE;

-- TEMPORARY: another member's names for two of the columns above. On the
-- shared database they are NOT NULL, so every row we insert has to fill them
-- in as well. Creating them here too means the same code works on a fresh
-- database. Delete this once the group agrees on one set of column names.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount TEXT;

-- Digonta's backend writes a file_url column that nothing had created yet,
-- so his inserts were failing. Adding it here costs us nothing.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_url TEXT;

-- Digonta's form sends a supplier id like "sup-420", which is text, not a
-- number. Widening the column to TEXT lets both his ids and our "1" fit.
ALTER TABLE invoices ALTER COLUMN supplier_id TYPE TEXT USING supplier_id::TEXT;

-- ---------------------------------------------------------------------------
-- Mihir's Invoice Pipeline Tracker.
-- His feature moves an invoice through a fixed set of stages and records who
-- moved it and when. It needs two columns the pieces above never created:
--
--   current_stage  where the invoice is in the pipeline (has a DEFAULT, which
--                  is why the sync trigger below treats it as never-empty)
--   created_at     used to order the pipeline newest-first
--
-- Both are added here so the whole platform works on a fresh database.
-- ---------------------------------------------------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'Submitted';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ DEFAULT NOW();

-- The pipeline's audit trail: one row per stage an invoice has passed through.
-- Mihir's backend reads it back as invoice_history(stage, actor, timestamp).
CREATE TABLE IF NOT EXISTS invoice_history (
  id         SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id),
  stage      TEXT,
  actor      TEXT,
  timestamp  TIMESTAMPTZ DEFAULT NOW()
);

-- Mihir's pipeline also records the previous status and an optional note on
-- each transition, so these two columns are added if an older table lacked them.
ALTER TABLE invoice_history ADD COLUMN IF NOT EXISTS old_status TEXT;
ALTER TABLE invoice_history ADD COLUMN IF NOT EXISTS note       TEXT;

-- ---------------------------------------------------------------------------
-- Module 2: Dynamic Discounting (Buyer-Funded Early Payment).
--
-- A buyer with surplus cash can offer early payment on confirmed invoices. The
-- supplier then accepts or declines. On acceptance the invoice is settled from
-- the buyer directly, so funder_id remains NULL and the payout values are
-- copied back onto invoices for the existing payout/cashflow screens.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dynamic_discount_offers (
  id                  SERIAL PRIMARY KEY,
  invoice_id           TEXT NOT NULL,
  buyer_name           TEXT NOT NULL,
  discount_rate        NUMERIC(6, 4) NOT NULL,
  platform_fee_rate    NUMERIC(6, 4) NOT NULL DEFAULT 0.0050,
  invoice_amount       NUMERIC(12, 2) NOT NULL,
  discount_amount      NUMERIC(12, 2) NOT NULL,
  supplier_payout      NUMERIC(12, 2) NOT NULL,
  platform_fee         NUMERIC(12, 2) NOT NULL,
  buyer_return         NUMERIC(12, 2) NOT NULL,
  status               TEXT NOT NULL DEFAULT 'Offered',
  offered_at           TIMESTAMPTZ DEFAULT NOW(),
  responded_at         TIMESTAMPTZ,
  settled_at           TIMESTAMPTZ
);

ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS invoice_id        TEXT;
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS buyer_name        TEXT;
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS discount_rate     NUMERIC(6, 4);
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS platform_fee_rate NUMERIC(6, 4) DEFAULT 0.0050;
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS invoice_amount    NUMERIC(12, 2);
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS discount_amount   NUMERIC(12, 2);
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS supplier_payout   NUMERIC(12, 2);
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS platform_fee      NUMERIC(12, 2);
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS buyer_return      NUMERIC(12, 2);
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'Offered';
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS offered_at        TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS responded_at      TIMESTAMPTZ;
ALTER TABLE dynamic_discount_offers ADD COLUMN IF NOT EXISTS settled_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_dynamic_discount_offers_invoice_id
  ON dynamic_discount_offers(invoice_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dynamic_discount_one_open_offer
  ON dynamic_discount_offers(invoice_id)
  WHERE status = 'Offered';

-- ---------------------------------------------------------------------------
-- Three members ended up with three names for the same three values:
--
--     invoice_number / number        the invoice's reference
--     invoice_amount / amount        how much it is for
--     status         / current_stage where it is in the pipeline
--
-- Some of those columns are NOT NULL, so an app that only knows one name has
-- its inserts rejected. This trigger copies whichever name was supplied into
-- the other, so every app can keep using the names it already knows.
--
-- Delete it once the group agrees on one set of names.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_invoice_columns() RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_number := COALESCE(NEW.invoice_number, NEW.number);
  NEW.number         := COALESCE(NEW.number, NEW.invoice_number);

  -- amount is stored as text, so strip anything that is not a digit or a dot
  -- before turning it into a number ("2,00,000" becomes 200000).
  NEW.invoice_amount := COALESCE(
    NEW.invoice_amount,
    NULLIF(REGEXP_REPLACE(COALESCE(NEW.amount, ''), '[^0-9.]', '', 'g'), '')::NUMERIC
  );
  NEW.amount := COALESCE(NEW.amount, NEW.invoice_amount::TEXT);

  -- current_stage has a DEFAULT, so it is never empty and COALESCE would
  -- never replace it. Whoever actually supplied a status wins instead.
  IF NEW.status IS NOT NULL THEN
    NEW.current_stage := NEW.status;
  ELSE
    NEW.status := NEW.current_stage;
  END IF;

  NEW.submitted_date := COALESCE(NEW.submitted_date, CURRENT_DATE);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_invoice_columns_trigger ON invoices;
CREATE TRIGGER sync_invoice_columns_trigger
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_columns();

-- Note: we do NOT store the discount.
-- It is always invoice_amount - payout_amount, so we calculate it in the
-- SELECT query instead. Storing it could let the two values disagree.

-- ---------------------------------------------------------------------------
-- Digonto's Module 2 - Buyer Invoice Confirmation & Digital Acknowledgment
-- ---------------------------------------------------------------------------

-- 1. Table to store immutable, timestamped digital acknowledgment records
CREATE TABLE IF NOT EXISTS invoice_confirmations (
  id                  SERIAL PRIMARY KEY,
  invoice_id          UUID NOT NULL REFERENCES invoices(id),
  buyer_name          TEXT NOT NULL,
  confirmed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledgment_text TEXT NOT NULL DEFAULT 'I, the authorized representative of the buyer entity, hereby confirm that the goods/services described in this invoice have been received in full and are accurate. I acknowledge the legally binding payment obligation for the stated amount on or before the due date.',
  UNIQUE(invoice_id)
);

-- 2. Add tracking columns to the invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS confirmation_id INTEGER REFERENCES invoice_confirmations(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();


-- ===========================================================================
--  FEATURE - Dispute Filing & Invoice Freeze   (Apurba Roy, SL 3)
-- ===========================================================================
-- frozen_at is this feature's own flag rather than a value written into the
-- status column. The invoice status column belongs to the state machine
-- another member owns, and only that service may write it. A separate
-- timestamp lets a dispute freeze an invoice without breaking that rule.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS disputes (
  id              SERIAL PRIMARY KEY,
  invoice_id      TEXT NOT NULL,   -- TEXT because the shared invoices table
                                   -- uses uuid ids and a fresh one uses
                                   -- integers; text accepts both
  filed_by        TEXT NOT NULL,
  reason          TEXT NOT NULL,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'Open',  -- Open | Released | Voided
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

-- Supporting documents. A dispute can have several - a delivery note, a
-- photograph of damaged goods, an email thread.
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id          SERIAL PRIMARY KEY,
  dispute_id  INTEGER NOT NULL REFERENCES disputes(id),
  uploaded_by TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "every step logged" - one row per thing that happened, never updated or
-- deleted, so the history of a dispute cannot be rewritten after the fact.
CREATE TABLE IF NOT EXISTS dispute_events (
  id         SERIAL PRIMARY KEY,
  dispute_id INTEGER NOT NULL REFERENCES disputes(id),
  event      TEXT NOT NULL,
  actor      TEXT NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- An invoice can only have one open dispute at a time. Enforcing it in the
-- database means two people clicking "dispute" at the same moment cannot
-- both succeed, however the application code is written.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_dispute_per_invoice
  ON disputes (invoice_id) WHERE status = 'Open';

-- ===========================================================================
-- Mihir's features: Notification Center + Supplier Health & Distress Analytics
-- ===========================================================================

-- In-App Notification Center. One row per alert-worthy event, shown in the bell
-- panel and mirrored by email through Nodemailer.
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  recipient    TEXT NOT NULL,
  message      TEXT NOT NULL,
  invoice_link TEXT,
  type         TEXT,
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier Health:
--   supplier_health         latest saved score/band per supplier
--   supplier_health_alerts  one row when a supplier crosses into a worse band
--   supplier_health_config  buyer-tunable band thresholds (single row, id = 1)
--   supplier_watchlist      suppliers the buyer flagged for closer monitoring
--   supplier_names          friendly names for text-id suppliers
CREATE TABLE IF NOT EXISTS supplier_health (
  supplier_id TEXT PRIMARY KEY,
  score       INTEGER,
  band        TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_health_alerts (
  id          SERIAL PRIMARY KEY,
  supplier_id TEXT,
  score       INTEGER,
  message     TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_health_config (
  id             INTEGER PRIMARY KEY,
  watch_below    INTEGER NOT NULL,
  distress_below INTEGER NOT NULL
);

INSERT INTO supplier_health_config (id, watch_below, distress_below)
VALUES (1, 80, 60)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS supplier_watchlist (
  supplier_id TEXT PRIMARY KEY,
  watchlisted BOOLEAN DEFAULT FALSE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_names (
  supplier_id TEXT PRIMARY KEY,
  name        TEXT NOT NULL
);

INSERT INTO supplier_names (supplier_id, name) VALUES
  ('BUP-606', 'Meghna Foods Ltd'),
  ('SUP-006', 'Padma Garments'),
  ('SUP-202', 'Jamuna Fabrics'),
  ('SUP-004', 'Karnaphuli Traders')
ON CONFLICT (supplier_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Mihir's Buyer Credit Scoring Engine.
--   buyer_credit_score    latest score/rating per buyer (read by other features)
--   buyer_credit_history  one row per score change, with a reason (transparency)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buyer_credit_score (
  buyer_name TEXT PRIMARY KEY,
  score      INTEGER,
  rating     TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS buyer_credit_history (
  id         SERIAL PRIMARY KEY,
  buyer_name TEXT,
  score      INTEGER,
  old_score  INTEGER,
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

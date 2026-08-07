-- ===========================================================================
--  Shared schema upgrade - RUN ONCE, AFTER THE GROUP AGREES.
--
--  Our current tables were designed for one feature (Payout History) and are
--  missing things the other members need. This adds them WITHOUT dropping any
--  table or deleting any row, so it is safe on the shared database.
--
--  Paste into the Supabase SQL Editor and run.
-- ===========================================================================


-- STEP 0 - check before you run.
-- The status constraint below will fail if any existing row holds a value
-- that is not in the approved list. Run this on its own first and look at
-- what comes back:
--
--     SELECT DISTINCT status FROM invoices;
--
-- Everything it returns must appear in the CHECK list in step 3.


-- ---------------------------------------------------------------------------
-- STEP 1 - buyers.
-- A B2B invoice is money one company owes another, but there is currently
-- nowhere to record who owes it. Module 2 (buyer portal) cannot work without
-- this, and the marketplace listing needs the buyer's name too.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buyers (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_id INTEGER REFERENCES buyers(id);


-- ---------------------------------------------------------------------------
-- STEP 2 - due date.
-- The OCR feature reads it off the invoice, the buyer's payment calendar is
-- built from it, the marketplace shows it as "maturity date", and the cash
-- flow forecast cannot be produced without it.
--
-- Left nullable so the existing 17 rows stay valid. Once every row has one,
-- the group can decide to make it NOT NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;


-- ---------------------------------------------------------------------------
-- STEP 3 - keep status spellings consistent.
-- Four people write to this column. Without a constraint we will end up with
-- 'Funded', 'funded' and 'FUNDED' all meaning the same thing. This makes the
-- database reject a typo instead of storing it.
-- ---------------------------------------------------------------------------
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN (
    'Submitted',
    'Buyer Confirmed',
    'Funded',
    'Payout Initiated',
    'Completed',
    'Disputed'
  ));


-- ---------------------------------------------------------------------------
-- STEP 4 - stop the same invoice being submitted twice.
-- Two different suppliers may legitimately use the same invoice number, so
-- the rule is per supplier, not global.
-- ---------------------------------------------------------------------------
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_supplier_invoice_unique;
ALTER TABLE invoices ADD CONSTRAINT invoices_supplier_invoice_unique
  UNIQUE (supplier_id, invoice_number);


-- ---------------------------------------------------------------------------
-- STEP 5 - speed up the ledger query.
-- Every query filters on supplier_id. Without an index Postgres reads the
-- whole table. Harmless now, but the ledger is meant to be permanent.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS invoices_supplier_id_idx ON invoices (supplier_id);


-- ===========================================================================
--  STILL MISSING - these belong to other members and should be designed by
--  whoever owns the feature, not added here:
--
--   * invoice_events (stage, actor, timestamp)  - Member 2, pipeline tracker
--   * disputes (notes, documents, resolution)   - Member 3, dispute filing
--   * risk rating / buyer credit score columns  - Members 2 and 4
--   * users and roles                           - Common Workflow 1, KYB
-- ===========================================================================

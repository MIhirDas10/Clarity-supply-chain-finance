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

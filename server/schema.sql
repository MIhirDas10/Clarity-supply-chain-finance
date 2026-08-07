-- Payout History feature - database schema
-- Run this first:  psql -U postgres -d clarity -f schema.sql

DROP TABLE IF EXISTS payouts;
DROP TABLE IF EXISTS funders;
DROP TABLE IF EXISTS suppliers;

-- The supplier who logs in and views their ledger.
CREATE TABLE suppliers (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

-- The bank / NBFI that put up the money for an invoice.
CREATE TABLE funders (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

-- One row = one invoice that was funded and paid out.
CREATE TABLE payouts (
  id             SERIAL PRIMARY KEY,
  supplier_id    INTEGER NOT NULL REFERENCES suppliers(id),
  funder_id      INTEGER NOT NULL REFERENCES funders(id),
  invoice_number TEXT NOT NULL,
  invoice_amount NUMERIC(12, 2) NOT NULL,  -- what the buyer originally owed
  payout_amount  NUMERIC(12, 2) NOT NULL,  -- what the supplier actually received
  payment_date   DATE NOT NULL
);

-- Note: we do NOT store the discount.
-- It is always invoice_amount - payout_amount, so we calculate it in the
-- SELECT query instead. Storing it could let the two values disagree.

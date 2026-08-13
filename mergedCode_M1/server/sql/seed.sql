-- Clarity - sample data
-- Run this with:  npm run setup
-- It only loads when supplier 1 has no invoices yet, so it can never
-- duplicate rows or disturb another member's data on the shared database.

INSERT INTO suppliers (id, name) VALUES (1, 'Rahman Textiles Ltd')
ON CONFLICT (id) DO NOTHING;

INSERT INTO funders (id, name) VALUES
  (1, 'City Bank PLC'),
  (2, 'BRAC Bank PLC'),
  (3, 'IDLC Finance PLC'),
  (4, 'LankaBangla Finance PLC')
ON CONFLICT (id) DO NOTHING;

-- The invoice number and amount are written twice on purpose: once into our
-- columns (invoice_number, invoice_amount) and once into another member's
-- columns (number, amount), which are NOT NULL on the shared database.
-- The "SELECT ... FROM (VALUES ...)" shape lets us list each value once and
-- copy it into both columns, instead of typing every number out twice.
INSERT INTO invoices
  (supplier_id, buyer_name, invoice_number, invoice_amount, due_date,
   submitted_date, status, funder_id, payout_amount, payment_date,
   number, amount)
SELECT
  supplier_id, buyer_name, invoice_number, invoice_amount, due_date,
  submitted_date, status, funder_id, payout_amount, payment_date,
  invoice_number, invoice_amount          -- the two duplicate columns
FROM (VALUES
  -- supplier, buyer, invoice no, amount, due date, submitted, status, funder, payout, paid on
  (1, 'Apex Footwear Ltd', 'INV-2026-1012', 1250000.00, DATE '2026-05-09', DATE '2026-02-08', 'Completed',        1,    1212500.00, DATE '2026-02-11'),
  (1, 'Beximco Pharma',    'INV-2026-1015',  850000.00, DATE '2026-05-21', DATE '2026-02-20', 'Completed',        2,     824500.00, DATE '2026-02-24'),
  (1, 'Square Group',      'INV-2026-1019', 2420000.00, DATE '2026-06-03', DATE '2026-03-05', 'Completed',        1,    2347400.00, DATE '2026-03-09'),
  (1, 'Envoy Textiles',    'INV-2026-1023',  610000.00, DATE '2026-06-22', DATE '2026-03-24', 'Completed',        3,     591700.00, DATE '2026-03-27'),
  (1, 'Apex Footwear Ltd', 'INV-2026-1027', 1780000.00, DATE '2026-07-09', DATE '2026-04-10', 'Completed',        2,    1726600.00, DATE '2026-04-14'),
  (1, 'Pran-RFL Group',    'INV-2026-1031',  935000.00, DATE '2026-07-26', DATE '2026-04-27', 'Completed',        4,     906950.00, DATE '2026-04-30'),
  (1, 'Square Group',      'INV-2026-1036', 3150000.00, DATE '2026-08-12', DATE '2026-05-14', 'Completed',        1,    3055500.00, DATE '2026-05-18'),
  (1, 'Envoy Textiles',    'INV-2026-1040',  720000.00, DATE '2026-08-27', DATE '2026-05-29', 'Completed',        3,     698400.00, DATE '2026-06-02'),
  (1, 'Beximco Pharma',    'INV-2026-1044', 1490000.00, DATE '2026-09-15', DATE '2026-06-17', 'Completed',        2,    1445300.00, DATE '2026-06-21'),
  (1, 'Pran-RFL Group',    'INV-2026-1049', 2080000.00, DATE '2026-10-02', DATE '2026-07-04', 'Completed',        4,    2017600.00, DATE '2026-07-08'),
  (1, 'Apex Footwear Ltd', 'INV-2026-1053',  545000.00, DATE '2026-10-17', DATE '2026-07-19', 'Completed',        1,     528650.00, DATE '2026-07-22'),
  (1, 'Square Group',      'INV-2026-1058', 1960000.00, DATE '2026-10-28', DATE '2026-07-30', 'Completed',        3,    1901200.00, DATE '2026-08-03'),

  -- money agreed, payment not sent yet
  (1, 'Nova Retail Group', 'INV-2026-1061', 1120000.00, DATE '2026-11-03', DATE '2026-08-05', 'Payout Initiated', 2,    1086400.00, NULL),
  (1, 'Envoy Textiles',    'INV-2026-1063',  780000.00, DATE '2026-11-04', DATE '2026-08-06', 'Funded',           4,     756600.00, NULL),

  (1, 'Beximco Pharma',    'INV-2026-1065', 1540000.00, DATE '2026-11-04', DATE '2026-08-06', 'Funded',           1,    1493800.00, NULL),
  (1, 'Pran-RFL Group',    'INV-2026-1067',  640000.00, DATE '2026-11-05', DATE '2026-08-07', 'Funded',           3,     620800.00, NULL),

  -- A disputed invoice is frozen and taken off the funder marketplace, so it
  -- genuinely has no funder and no payout. This is the row that proves the
  -- ledger uses a LEFT JOIN - a plain JOIN would drop it entirely.
  (1, 'Nova Retail Group', 'INV-2026-1069', 2260000.00, DATE '2026-11-05', DATE '2026-08-07', 'Disputed',         NULL, NULL,       NULL)
) AS v (supplier_id, buyer_name, invoice_number, invoice_amount, due_date,
        submitted_date, status, funder_id, payout_amount, payment_date);

-- Payout History feature - sample data
-- Run this second:  psql -U postgres -d clarity -f seed.sql

INSERT INTO suppliers (id, name) VALUES
  (1, 'Rahman Textiles Ltd');

INSERT INTO funders (id, name) VALUES
  (1, 'City Bank PLC'),
  (2, 'BRAC Bank PLC'),
  (3, 'IDLC Finance PLC'),
  (4, 'LankaBangla Finance PLC');

-- supplier_id, funder_id, invoice no, invoice amount, payout received, date
INSERT INTO payouts (supplier_id, funder_id, invoice_number, invoice_amount, payout_amount, payment_date) VALUES
  (1, 1, 'INV-2026-1012', 1250000.00, 1212500.00, '2026-02-11'),
  (1, 2, 'INV-2026-1015',  850000.00,  824500.00, '2026-02-24'),
  (1, 1, 'INV-2026-1019', 2420000.00, 2347400.00, '2026-03-09'),
  (1, 3, 'INV-2026-1023',  610000.00,  591700.00, '2026-03-27'),
  (1, 2, 'INV-2026-1027', 1780000.00, 1726600.00, '2026-04-14'),
  (1, 4, 'INV-2026-1031',  935000.00,  906950.00, '2026-04-30'),
  (1, 1, 'INV-2026-1036', 3150000.00, 3055500.00, '2026-05-18'),
  (1, 3, 'INV-2026-1040',  720000.00,  698400.00, '2026-06-02'),
  (1, 2, 'INV-2026-1044', 1490000.00, 1445300.00, '2026-06-21'),
  (1, 4, 'INV-2026-1049', 2080000.00, 2017600.00, '2026-07-08'),
  (1, 1, 'INV-2026-1053',  545000.00,  528650.00, '2026-07-22'),
  (1, 3, 'INV-2026-1058', 1960000.00, 1901200.00, '2026-08-03');

-- Note: suppliers and funders get their ids written in by hand above, so the
-- payout rows can point at them. schema.sql drops and recreates the tables
-- every time, so the ids always come out the same.

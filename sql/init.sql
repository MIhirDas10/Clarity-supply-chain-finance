DROP TABLE IF EXISTS invoices CASCADE;

CREATE TABLE IF NOT EXISTS invoices (
  id              SERIAL PRIMARY KEY,
  supplier_id     VARCHAR(50)    NOT NULL,
  buyer_name      VARCHAR(200)   NOT NULL,
  invoice_number  VARCHAR(50)    UNIQUE NOT NULL,
  amount          NUMERIC(14,2)  NOT NULL,
  due_date        DATE           NOT NULL,
  file_url        TEXT,
  status          VARCHAR(20)    NOT NULL DEFAULT 'Pending',
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Seed a few sample rows for initial demo
INSERT INTO invoices (supplier_id, buyer_name, invoice_number, amount, due_date, file_url, status)
VALUES
  ('SUP-001', 'Apex Footwear Ltd.',  'INV-1001', 4500000.00, '2026-09-15', NULL, 'Confirmed'),
  ('SUP-002', 'Beximco Pharma',      'INV-1002', 2500000.00, '2026-08-30', NULL, 'Pending'),
  ('SUP-003', 'Square Group',        'INV-1003',  850000.00, '2026-10-01', NULL, 'Pending'),
  ('SUP-004', 'BRAC Bank',           'INV-1004', 5000000.00, '2026-08-20', NULL, 'Confirmed'),
  ('SUP-005', 'Envoy Textiles',      'INV-1005', 3400000.00, '2026-09-10', NULL, 'Rejected')
ON CONFLICT (invoice_number) DO NOTHING;

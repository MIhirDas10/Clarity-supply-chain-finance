-- Reference data: the lists the app needs to work at all.
-- Safe to run every time - ON CONFLICT DO NOTHING means existing rows are
-- left exactly as they are. Sample invoices live in seed.sql instead,
-- because those should only load into an empty database.

INSERT INTO suppliers (id, name) VALUES (1, 'Rahman Textiles Ltd')
ON CONFLICT (id) DO NOTHING;

INSERT INTO funders (id, name) VALUES
  (1, 'City Bank PLC'),
  (2, 'BRAC Bank PLC'),
  (3, 'IDLC Finance PLC'),
  (4, 'LankaBangla Finance PLC')
ON CONFLICT (id) DO NOTHING;

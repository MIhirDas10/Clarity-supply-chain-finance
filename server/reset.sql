-- ===========================================================================
--  WARNING - THIS DELETES EVERYTHING, FOR EVERY MEMBER OF THE GROUP.
--
--  Our Supabase database is shared. Running this wipes your teammates' data
--  as well as your own. There is no undo.
--
--  It is deliberately NOT wired to an npm script. To use it you must paste
--  it into the Supabase SQL Editor yourself, on purpose, after telling the
--  group. Normal setup uses  npm run setup , which never drops anything.
-- ===========================================================================

DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS funders;
DROP TABLE IF EXISTS suppliers;

-- After running this, run  npm run setup  to recreate the tables and
-- reload the sample data.

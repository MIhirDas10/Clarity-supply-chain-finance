// Creates one shared connection to the PostgreSQL database.
// Both index.js and setup.js import this same `pool` and run queries through it.

const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// IF YOU ARE RUNNING THIS ON A DIFFERENT PC, THIS IS THE ONLY LINE TO CHANGE.
// Format:  postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE_NAME
// ---------------------------------------------------------------------------
const CONNECTION_STRING = 'postgresql://postgres:postgres@localhost:5432/clarity';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || CONNECTION_STRING,
});

module.exports = pool;

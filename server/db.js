// Creates one shared connection to the PostgreSQL database.
// Both index.js and setup.js import this same `pool` and run queries through it.

const { Pool } = require('pg');

// Where is the database?
//
//  - Using Supabase (or any cloud database): put the connection string in a
//    file called .env next to this one, as   DATABASE_URL=postgresql://...
//    .env is in .gitignore, so the password never goes onto GitHub.
//
//  - Using PostgreSQL installed on this PC: no .env needed, the line below
//    is used instead. Change the password here if yours is different.
//
const LOCAL_CONNECTION = 'postgresql://postgres:postgres@localhost:5432/clarity';

const connectionString = process.env.DATABASE_URL || LOCAL_CONNECTION;

// A cloud database only accepts encrypted connections. A database running on
// this same PC does not use encryption, so we switch it off for localhost.
const isCloudDatabase = !connectionString.includes('localhost');

const pool = new Pool({
  connectionString: connectionString,
  ssl: isCloudDatabase ? { rejectUnauthorized: false } : false,
});

module.exports = pool;

// Clarity B2B - unified backend server.
//
// One Express app serving every group member's API. There are no route
// clashes because each area lives under its own prefix:
//
//   /api/invoices          Apurba  - upload + list invoices  (PostgreSQL / pg)
//   /api/payouts           Apurba  - payout ledger + CSV export
//   /api/pipeline/invoices Mihir   - status pipeline + history (Supabase)
//   /api-docs              Mihir   - Swagger API documentation
//
// Both data layers (raw `pg` and the Supabase client) talk to the SAME Supabase
// PostgreSQL database, so every feature reads and writes the same invoices.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');

const invoiceRoutes = require('./routes/invoiceRoutes');   // Apurba (pg)
const pipelineRoutes = require('./routes/pipelineRoutes');  // Mihir (Supabase)
const cashflowRoutes = require('./routes/cashflowRoutes');  // Ameet (Cash Flow Forecast)

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());          // lets the React client (Vite dev server) call this API
app.use(express.json());  // parse JSON request bodies

// Swagger API documentation (Mihir)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Apurba - invoice upload/list + payout history
app.use('/api', invoiceRoutes);

// Ameet - Cash Flow Forecast Engine
app.use('/api/cashflow', cashflowRoutes);

// Mihir - invoice status pipeline (kept under its own prefix to avoid clashing
// with Apurba's /api/invoices). The client calls /api/pipeline/invoices...
app.use('/api/pipeline/invoices', pipelineRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'Clarity B2B API is running', docs: '/api-docs' });
});

app.listen(PORT, () => {
  console.log('Clarity B2B API running on http://localhost:' + PORT);
  console.log('API docs at http://localhost:' + PORT + '/api-docs');
});

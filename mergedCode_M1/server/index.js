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

const invoiceRoutes = require('./routes/invoiceRoutes');   // Apurba - M1 Invoice Upload with OCR
const disputeRoutes = require('./routes/disputeRoutes');   // Apurba - M2 Dispute Filing & Freeze
const payoutRoutes = require('./routes/payoutRoutes');     // Apurba - payout ledger (supporting)
const pipelineRoutes = require('./routes/pipelineRoutes');  // Mihir (Supabase)
const cashflowRoutes = require('./routes/cashflowRoutes');  // Ameet (Cash Flow Forecast Engine)
const confirmationRoutes = require('./routes/confirmationRoutes'); // Digonto (M2 Confirmations)
const dynamicDiscountingRoutes = require('./routes/dynamicDiscountingRoutes'); // Module 2

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());          // lets the React client (Vite dev server) call this API
// 10mb rather than the 100kb default: an invoice photo sent as a data URI is
// base64, which is about a third larger than the file itself.
app.use(express.json({ limit: '10mb' }));

// Swagger API documentation (Mihir)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Apurba - M1 invoice upload with OCR, M2 dispute filing, plus the payout ledger
app.use('/api/invoices', invoiceRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/payouts', payoutRoutes);

// Ameet - Cash Flow Forecast Engine
app.use('/api/cashflow', cashflowRoutes);

// Digonto - Module 2 Buyer Confirmation
app.use('/api/confirmations', confirmationRoutes);

// Module 2 - buyer-funded early payment offers
app.use('/api/dynamic-discounting', dynamicDiscountingRoutes);

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

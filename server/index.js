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

require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');         // Common Workflow - Login, Signup & Admin Approval
const invoiceRoutes = require('./routes/invoiceRoutes');   // Apurba - M1 Invoice Upload with OCR
const disputeRoutes = require('./routes/disputeRoutes');   // Apurba - M2 Dispute Filing & Freeze
const payoutRoutes = require('./routes/payoutRoutes');     // Apurba - payout ledger (supporting)
const walletRoutes = require('./routes/walletRoutes');     // Apurba - M3 Funder Deposit & Funding (bKash)
const autoInvestRoutes = require('./routes/autoInvestRoutes'); // Apurba - M3 Auto-Invest Rules Engine
const pipelineRoutes = require('./routes/pipelineRoutes');  // Mihir (Supabase)
const healthRoutes = require('./routes/healthRoutes');      // Mihir - Supplier Health Analytics
const notificationRoutes = require('./routes/notificationRoutes'); // Mihir - Notification Center
const portfolioRoutes = require('./routes/portfolioRoutes'); // Mihir - Investor Portfolio
const creditRoutes = require('./routes/creditRoutes'); // Mihir - Buyer Credit Scoring

const cashflowRoutes = require('./routes/cashflowRoutes');  // Ameet (Cash Flow Forecast Engine)
const confirmationRoutes = require('./routes/confirmationRoutes'); // Digonto (M2 Confirmations)
const documentRoutes = require('./routes/documentRoutes'); // Digonto (M1 Document Vault)
const dynamicDiscountingRoutes = require('./routes/dynamicDiscountingRoutes'); // Ameet (M2 Buyer-Funded Early Payment Offers)
const marketplaceRoutes = require('./routes/marketplaceRoutes'); // Digonto (M3 Marketplace)
const settlementRoutes = require('./routes/settlementRoutes'); // Ameet (M3 Repayment & Settlement)
const calendarRoutes = require('./routes/calendarRoutes'); // Ameet (M4 Google Calendar Sync)
const erpRoutes = require('./routes/erpRoutes'); // Mihir (M2 ERP / Google Sheets Integration)

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const { requireAuth, requireAuthAllowPaused } = require('./middleware/auth');
const { configured: calendarConfigured } = require('./services/calendarSync');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());          // lets the React client (Vite dev server) call this API
// 10mb rather than the 100kb default: an invoice photo sent as a data URI is
// base64, which is about a third larger than the file itself.
app.use(express.json({ limit: '10mb' }));

// Swagger API documentation (Mihir)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Login, Signup & Admin Approval - everyone's dashboards depend on this
app.use('/api/auth', authRoutes);

// Google redirects here without the Clarity bearer token. OAuth state stored
// in Supabase ties the callback back to the authenticated user who connected.
app.get('/api/calendar/oauth/callback', calendarRoutes.oauthCallback);
app.get('/api/erp/oauth/callback', erpRoutes.oauthCallback);

// Documents are accessible even if the user is paused (e.g. to upload compliance docs)
app.use('/api/documents', requireAuthAllowPaused, documentRoutes);

app.use('/api', requireAuth);

// Apurba - M1 invoice upload with OCR, M2 dispute filing, plus the payout ledger
app.use('/api/invoices', invoiceRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/auto-invest', autoInvestRoutes);
// Ameet - Cash Flow Forecast Engine
app.use('/api/cashflow', cashflowRoutes);

// Digonto - Module 2 Buyer Confirmation
app.use('/api/confirmations', confirmationRoutes);

// Digonto - Module 3 Funder Marketplace
app.use('/api/marketplace', marketplaceRoutes);

// Module 2 - buyer-funded early payment offers
app.use('/api/dynamic-discounting', dynamicDiscountingRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/calendar', calendarRoutes);

// Mihir - invoice status pipeline (kept under its own prefix to avoid clashing
// with Apurba's /api/invoices). The client calls /api/pipeline/invoices...
app.use('/api/pipeline/invoices', pipelineRoutes);

// Mihir - Supplier Health & Distress-Signal Analytics
app.use('/api/health', healthRoutes);

// Mihir - In-App Notification Center (read + mark-as-read)
app.use('/api/notifications', notificationRoutes);

// Mihir - Investor Portfolio & Returns Analytics
app.use('/api/portfolio', portfolioRoutes);

// Mihir - Buyer Credit Scoring Engine
app.use('/api/credit', creditRoutes);

// Mihir - ERP / Accounting Integration (Google Sheets)
app.use('/api/erp', erpRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'Clarity B2B API is running', docs: '/api-docs' });
});

app.listen(PORT, () => {
  console.log('Clarity B2B API running on http://localhost:' + PORT);
  console.log('Google Calendar credentials configured: ' + calendarConfigured());
  console.log('API docs at http://localhost:' + PORT + '/api-docs');
});

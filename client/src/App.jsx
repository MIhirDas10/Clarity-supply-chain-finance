import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from "react-router-dom";
import { LogOut, ShieldAlert } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import BuyerSidebar from "./components/BuyerSidebar.jsx";
import FunderSidebar from "./components/FunderSidebar.jsx";
import Header from "./components/Header.jsx";
import Landing from "./Landing.jsx";

import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import Login from "./auth/Login.jsx";
import Signup from "./auth/Signup.jsx";
import AdminDashboard from "./auth/AdminDashboard.jsx";

// Each member's feature page, kept in its own folder with its original code.
import Dashboard from "./mihir/pages/Dashboard.jsx";              // Mihir  - Invoice Pipeline Tracker
import InvoiceUpload from "./apurba/InvoiceUpload.jsx";           // Apurba - OCR Invoice Upload
import MyInvoices from "./apurba/MyInvoices.jsx";                  // Apurba - My Invoices
import DisputeCentre from "./apurba/DisputeCentre.jsx";            // Apurba - Dispute Filing & Invoice Freeze (M2)
import PayoutHistory from "./apurba/PayoutHistory.jsx";            // Apurba - Payout History
import FunderWallet from "./apurba/FunderWallet.jsx";              // Apurba - Funder Deposit & Funding (M3)
import AutoInvestRules from "./apurba/AutoInvestRules.jsx";        // Apurba - Auto-Invest Rules Engine (M3)
import InvoicesPage from "./digonto/pages/Invoices.jsx";       // Digonto - Discount Calculator (M1)
import BuyerConfirmation from "./digonto/pages/BuyerConfirmation.jsx"; // Digonto - Buyer Confirmation (M2)
import FunderMarketplace from "./digonto/pages/FunderMarketplace.jsx"; // Digonto - Funder Marketplace (M3)
import DocumentVault from "./digonto/pages/DocumentVault.jsx"; // Digonto - Document Vault (M1)
import CashFlowForecast from "./ameet/CashFlowForecast.jsx";   // Ameet - Module 1 - Cash Flow Forecast Engine
import DynamicDiscounting from "./ameet/DynamicDiscounting.jsx"; // Ameet -  Module 2 - Buyer-funded early payment
import SupplierDynamicDiscountOffers from "./ameet/SupplierDynamicDiscountOffers.jsx"; // Ameet - Module 2 - Supplier view of buyer-funded early payment offers
import RepaymentSettlement from "./ameet/RepaymentSettlement.jsx"; // Ameet - Module 3 - Repayment Settlement
import RepaymentCalendar from "./ameet/RepaymentCalendar.jsx"; // Ameet - Module 4 - Repayment Calendar with Google Calendar integration
import SupplierHealth from "./mihir/pages/SupplierHealth.jsx";           // Mihir - Supplier Health Analytics
import Notifications from "./mihir/pages/Notifications.jsx";             // Mihir - Notification Center
import Portfolio from "./mihir/pages/Portfolio.jsx";                     // Mihir - Investor Portfolio
import BuyerCredit from "./mihir/pages/BuyerCredit.jsx";                 // Mihir - Buyer Credit Scoring

function PausedScreen({ reason, vaultPath }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 min-h-[calc(100vh-64px)] p-6 w-full">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-red-100 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Account Paused</h2>
        <p className="text-slate-600 mb-6">{reason || 'Your account has been temporarily paused by an administrator.'}</p>
        {vaultPath && (
          <Link to={vaultPath} className="inline-flex items-center justify-center px-6 py-2.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition">
            Go to Document Vault
          </Link>
        )}
      </div>
    </div>
  );
}

function RoleLayoutInner({ children, vaultPath }) {
  const { user } = useAuth();
  const location = useLocation();
  const isVault = location.pathname.includes('/vault');
  
  if (user?.is_paused && !isVault) {
    return (
      <div className="flex-1 ml-[250px] flex flex-col relative">
        <Header />
        <main className="flex-1 overflow-x-hidden relative flex">
          <PausedScreen reason={user.pause_reason} vaultPath={vaultPath} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 ml-[250px] flex flex-col relative">
      <Header />
      <main className="flex-1 overflow-x-hidden relative">{children}</main>
    </div>
  );
}

function SupplierLayout({ children }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--page-bg)" }}>
      <Sidebar />
      <RoleLayoutInner vaultPath="/vault">{children}</RoleLayoutInner>
    </div>
  );
}

function BuyerLayout({ children }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--page-bg)" }}>
      <BuyerSidebar />
      <RoleLayoutInner>{children}</RoleLayoutInner>
    </div>
  );
}

function FunderLayout({ children }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--page-bg)" }}>
      <FunderSidebar />
      <RoleLayoutInner vaultPath="/funder/vault">{children}</RoleLayoutInner>
    </div>
  );
}

// The admin panel is not a supplier or a buyer, so it gets its own small
// shell rather than borrowing either sidebar - a plain top bar with a
// logout button is enough for the one page that lives here today.
function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--page-bg)" }}>
      <header
        className="flex items-center justify-between px-6"
        style={{ height: 60, background: "#0F172A", color: "#fff" }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }}>Clarity B2B — Admin</span>
        <div className="flex items-center gap-4">
          <span style={{ fontSize: 13, opacity: 0.8 }}>{user?.business_name}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 cursor-pointer"
            style={{ fontSize: 13, color: "#fff", background: "none", border: "none" }}
          >
            <LogOut size={15} /> Log out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

// Apurba's pages were written to sit inside a ".content" wrapper (padding +
// max-width). The unified layout re-supplies it so they look like they did in
// Apurba's standalone app. Digonto's and Mihir's pages carry their own padding.
function Content({ children }) {
  return <div className="content">{children}</div>;
}

function Placeholder({ name }) {
  return (
    <div style={{ padding: "40px", color: "var(--text-secondary)" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>
        {name}
      </h1>
      <p style={{ marginTop: "6px" }}>This part of the portal has not been built yet.</p>
    </div>
  );
}

// "/" has no fixed destination - it depends on who, if anyone, is logged in.
// ProtectedRoute cannot help here because there is nothing role-specific to
// protect; this component just decides where "home" means for this visitor.
const HOME_BY_ROLE = {
  admin: "/admin",
  supplier: "/pipeline",
  buyer: "/buyer/dynamic-discounting",
  funder: "/funder/portfolio",
};

function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={HOME_BY_ROLE[user.role] || "/login"} replace />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public - no login required */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route path="/home" element={<RoleHome />} />

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["admin"]}>
                <AdminLayout><AdminDashboard /></AdminLayout>
              </ProtectedRoute>
            }
          />

          {/* Supplier Routes - admins can view these too, for oversight */}
          <Route path="/pipeline" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><Dashboard /></SupplierLayout></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><Content><InvoiceUpload /></Content></SupplierLayout></ProtectedRoute>} />
          <Route path="/discount" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><InvoicesPage /></SupplierLayout></ProtectedRoute>} />
          <Route path="/my-invoices" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><Content><MyInvoices /></Content></SupplierLayout></ProtectedRoute>} />
          <Route path="/payouts" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><Content><PayoutHistory /></Content></SupplierLayout></ProtectedRoute>} />
          <Route path="/vault" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><DocumentVault /></SupplierLayout></ProtectedRoute>} />
          <Route path="/marketplace" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><FunderMarketplace /></SupplierLayout></ProtectedRoute>} />
          <Route path="/wallet" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><FunderWallet /></SupplierLayout></ProtectedRoute>} />
          <Route path="/auto-invest" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><AutoInvestRules /></SupplierLayout></ProtectedRoute>} />
          <Route path="/funder/marketplace" element={<ProtectedRoute roles={["funder", "admin"]}><FunderLayout><FunderMarketplace /></FunderLayout></ProtectedRoute>} />
          <Route path="/funder/vault" element={<ProtectedRoute roles={["funder", "admin"]}><FunderLayout><DocumentVault /></FunderLayout></ProtectedRoute>} />
          <Route path="/funder/wallet" element={<ProtectedRoute roles={["funder", "admin"]}><FunderLayout><FunderWallet /></FunderLayout></ProtectedRoute>} />
          <Route path="/funder/auto-invest" element={<ProtectedRoute roles={["funder", "admin"]}><FunderLayout><AutoInvestRules /></FunderLayout></ProtectedRoute>} />
          <Route path="/cashflow" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><CashFlowForecast /></SupplierLayout></ProtectedRoute>} />
          <Route path="/buyer-funded-offers" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><SupplierDynamicDiscountOffers /></SupplierLayout></ProtectedRoute>} />
          <Route path="/settlements" element={<ProtectedRoute roles={["admin"]}><AdminLayout><RepaymentSettlement /></AdminLayout></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute roles={["admin"]}><AdminLayout><RepaymentCalendar /></AdminLayout></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><Notifications /></SupplierLayout></ProtectedRoute>} />
          <Route path="/portfolio" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><Portfolio /></SupplierLayout></ProtectedRoute>} />
          <Route path="/funder/notifications" element={<ProtectedRoute roles={["funder", "admin"]}><FunderLayout><Notifications /></FunderLayout></ProtectedRoute>} />
          <Route path="/funder/portfolio" element={<ProtectedRoute roles={["funder", "admin"]}><FunderLayout><Portfolio /></FunderLayout></ProtectedRoute>} />
          <Route path="/funder/settlements" element={<ProtectedRoute roles={["funder", "admin"]}><FunderLayout><RepaymentSettlement /></FunderLayout></ProtectedRoute>} />
          <Route path="/funder/calendar" element={<ProtectedRoute roles={["funder", "admin"]}><FunderLayout><RepaymentCalendar /></FunderLayout></ProtectedRoute>} />
          <Route path="/funder/credit" element={<ProtectedRoute roles={["funder", "admin"]}><FunderLayout><BuyerCredit /></FunderLayout></ProtectedRoute>} />
          <Route path="/credit" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><BuyerCredit /></SupplierLayout></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute roles={["supplier", "admin"]}><SupplierLayout><Placeholder name="Settings" /></SupplierLayout></ProtectedRoute>} />

          {/* Buyer Routes */}
          <Route path="/buyer" element={<Navigate to="/buyer/dynamic-discounting" replace />} />
          <Route
            path="/buyer/dynamic-discounting"
            element={
              <ProtectedRoute roles={["buyer", "admin"]}>
                <BuyerLayout><DynamicDiscounting /></BuyerLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/buyer/health"
            element={
              <ProtectedRoute roles={["buyer", "admin"]}>
                <BuyerLayout><Content><SupplierHealth /></Content></BuyerLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/buyer/buyer-confirmation"
            element={
              <ProtectedRoute roles={["buyer", "admin"]}>
                <BuyerLayout><BuyerConfirmation /></BuyerLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/buyer/disputes"
            element={
              <ProtectedRoute roles={["buyer", "admin"]}>
                <BuyerLayout><Content><DisputeCentre /></Content></BuyerLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/buyer/settlements" element={<ProtectedRoute roles={["buyer", "admin"]}><BuyerLayout><RepaymentSettlement /></BuyerLayout></ProtectedRoute>} />
          <Route path="/buyer/calendar" element={<ProtectedRoute roles={["buyer", "admin"]}><BuyerLayout><RepaymentCalendar /></BuyerLayout></ProtectedRoute>} />

          <Route path="*" element={<RoleHome />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

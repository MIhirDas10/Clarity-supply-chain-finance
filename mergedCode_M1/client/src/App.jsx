import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import BuyerSidebar from "./components/BuyerSidebar.jsx";
import Header from "./components/Header.jsx";

// Each member's feature page, kept in its own folder with its original code.
import Dashboard from "./mihir/pages/Dashboard.jsx";              // Mihir  - Invoice Pipeline Tracker
import InvoiceUpload from "./apurba/InvoiceUpload.jsx";           // Apurba - OCR Invoice Upload
import MyInvoices from "./apurba/MyInvoices.jsx";                  // Apurba - My Invoices
import PayoutHistory from "./apurba/PayoutHistory.jsx";            // Apurba - Payout History
import InvoicesPage from "./digonto/pages/Invoices.jsx";       // Digonto - Discount Calculator (M1)
import BuyerConfirmation from "./digonto/pages/BuyerConfirmation.jsx"; // Digonto - Buyer Confirmation (M2)
import CashFlowForecast from "./ameet/CashFlowForecast.jsx";   // Ameet   - Cash Flow Forecast Engine
import DynamicDiscounting from "./ameet/DynamicDiscounting.jsx"; // Module 2 - Buyer-funded early payment
import SupplierDynamicDiscountOffers from "./ameet/SupplierDynamicDiscountOffers.jsx";

function SupplierLayout({ children }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--page-bg)" }}>
      <Sidebar />
      <div className="flex-1 ml-[250px] flex flex-col relative">
        <Header />
        <main className="flex-1 overflow-x-hidden relative">{children}</main>
      </div>
    </div>
  );
}

function BuyerLayout({ children }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--page-bg)" }}>
      <BuyerSidebar />
      <div className="flex-1 ml-[250px] flex flex-col relative">
        <Header />
        <main className="flex-1 overflow-x-hidden relative">{children}</main>
      </div>
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

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/pipeline" replace />} />

        {/* Supplier Routes */}
        <Route path="/pipeline" element={<SupplierLayout><Dashboard /></SupplierLayout>} />
        <Route path="/upload" element={<SupplierLayout><Content><InvoiceUpload /></Content></SupplierLayout>} />
        <Route path="/discount" element={<SupplierLayout><InvoicesPage /></SupplierLayout>} />
        <Route path="/my-invoices" element={<SupplierLayout><Content><MyInvoices /></Content></SupplierLayout>} />
        <Route path="/buyer-confirmation" element={<SupplierLayout><BuyerConfirmation /></SupplierLayout>} />
        <Route path="/payouts" element={<SupplierLayout><Content><PayoutHistory /></Content></SupplierLayout>} />
        <Route path="/cashflow" element={<SupplierLayout><CashFlowForecast /></SupplierLayout>} />
        <Route path="/buyer-funded-offers" element={<SupplierLayout><SupplierDynamicDiscountOffers /></SupplierLayout>} />
        <Route path="/notifications" element={<SupplierLayout><Placeholder name="Notifications" /></SupplierLayout>} />
        <Route path="/settings" element={<SupplierLayout><Placeholder name="Settings" /></SupplierLayout>} />

        {/* Buyer Routes */}
        <Route path="/buyer" element={<Navigate to="/buyer/dynamic-discounting" replace />} />
        <Route path="/buyer/dynamic-discounting" element={<BuyerLayout><DynamicDiscounting /></BuyerLayout>} />

        <Route path="*" element={<Navigate to="/pipeline" replace />} />
      </Routes>
    </Router>
  );
}

export default App;

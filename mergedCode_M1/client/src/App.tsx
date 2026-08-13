import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";

// Each member's feature page, kept in its own folder with its original code.
import Dashboard from "./mihir/pages/Dashboard";          // Mihir  - Invoice Pipeline Tracker
import InvoiceUpload from "./apurba/InvoiceUpload";        // Apurba - OCR Invoice Upload
import MyInvoices from "./apurba/MyInvoices";              // Apurba - My Invoices
import PayoutHistory from "./apurba/PayoutHistory";        // Apurba - Payout History
import InvoicesPage from "./digonto/pages/Invoices";       // Digonto - Discount Calculator

function Layout({ children }: { children: React.ReactNode }) {
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

// Apurba's pages were written to sit inside a ".content" wrapper (padding +
// max-width). The unified layout re-supplies it so they look like they did in
// Apurba's standalone app. Digonto's and Mihir's pages carry their own padding.
function Content({ children }: { children: React.ReactNode }) {
  return <div className="content">{children}</div>;
}

function Placeholder({ name }: { name: string }) {
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
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/pipeline" replace />} />
          <Route path="/pipeline" element={<Dashboard />} />
          <Route path="/upload" element={<Content><InvoiceUpload /></Content>} />
          <Route path="/discount" element={<InvoicesPage />} />
          <Route path="/my-invoices" element={<Content><MyInvoices /></Content>} />
          <Route path="/payouts" element={<Content><PayoutHistory /></Content>} />
          <Route path="/cashflow" element={<Placeholder name="Cash Flow" />} />
          <Route path="/notifications" element={<Placeholder name="Notifications" />} />
          <Route path="/settings" element={<Placeholder name="Settings" />} />
          <Route path="*" element={<Navigate to="/pipeline" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;

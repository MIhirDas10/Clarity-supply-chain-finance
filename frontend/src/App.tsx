import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import InvoicesPage from "./pages/Invoices";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--page-bg)]">
      <Sidebar />
      <div className="flex-1 ml-[250px] flex flex-col relative">
        <Header />
        <main className="flex-1 overflow-x-hidden relative">
          {children}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/invoices" replace />} />
          <Route path="/invoices" element={<InvoicesPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;

import { useState } from 'react';
import Sidebar from './Sidebar.jsx';
import InvoiceUpload from './InvoiceUpload.jsx';
import PayoutHistory from './PayoutHistory.jsx';
import MyInvoices from './MyInvoices.jsx';
import DisputeCentre from './DisputeCentre.jsx';

// Pages that are in the sidebar but not built yet. Showing an honest
// placeholder is better than a link that does nothing when clicked.
const NOT_BUILT = {
  cashflow: 'Cash Flow',
  notifications: 'Notifications',
  settings: 'Settings',
};

function Placeholder({ name }) {
  return (
    <div>
      <div className="header-row">
        <div>
          <h1>{name}</h1>
          <p className="subtitle">This part of the portal has not been built yet.</p>
        </div>
      </div>
      <div className="panel">
        <p className="message">Another member of the group owns this feature.</p>
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState('upload');

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={setPage} />

      <div className="main">
        <header className="topbar">
          <span className="topbar-title">Rahman Textiles Ltd</span>
          <span className="avatar">RT</span>
        </header>

        <main className="content">
          {page === 'disputes' && <DisputeCentre />}
          {page === 'upload' && <InvoiceUpload />}
          {page === 'invoices' && <MyInvoices />}
          {page === 'payouts' && <PayoutHistory />}
          {NOT_BUILT[page] && <Placeholder name={NOT_BUILT[page]} />}
        </main>
      </div>
    </div>
  );
}

export default App;

import { useEffect, useState } from 'react';
import {
  FileText,
  TrendingUp,
  Clock,
  AlertTriangle,
  RefreshCw,
  Download,
} from 'lucide-react';

const API_URL = 'http://localhost:1012';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTaka(amount) {
  if (amount === null) {
    return '—';
  }
  return '৳ ' + Number(amount).toLocaleString('en-IN');
}

function formatDate(value) {
  if (!value) {
    return '—';
  }
  const parts = value.split('-');
  return parts[2] + ' ' + MONTHS[Number(parts[1]) - 1] + ' ' + parts[0];
}

function chipClass(status) {
  if (!status) {
    return 'chip chip-unknown';
  }
  return 'chip chip-' + status.toLowerCase().split(' ').join('-');
}

// The group is currently using two sets of status words. Until that is
// settled, these count both spellings so the cards show real numbers.
const PENDING_STATUSES = ['Pending', 'Submitted'];
const CONFIRMED_STATUSES = [
  'Confirmed', 'Buyer Confirmed', 'Funded', 'Payout Initiated', 'Completed', 'Disbursed',
];

function StatCard({ icon: Icon, label, value, change, colour }) {
  return (
    <div className={'stat-card stat-' + colour}>
      <div className="stat-top">
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value">{value}</p>
        </div>
        <span className={'stat-icon stat-icon-' + colour}>
          <Icon size={20} />
        </span>
      </div>
      {change && <span className="stat-change">↗ {change}</span>}
    </div>
  );
}

function MyInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Every invoice in the shared database, not only ours - so anything
  // submitted through Digonta's form shows up here too.
  useEffect(() => {
    setLoading(true);
    fetch(API_URL + '/api/invoices')
      .then((response) => response.json())
      .then((data) => {
        setInvoices(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not reach the server. Is it running on port 4000?');
        setLoading(false);
      });
  }, [refreshKey]);

  // Add up the numbers behind the four cards.
  let totalValue = 0;
  let pendingCount = 0;
  let confirmedCount = 0;

  for (const invoice of invoices) {
    totalValue += Number(invoice.invoice_amount || 0);

    if (PENDING_STATUSES.includes(invoice.status)) {
      pendingCount += 1;
    }
    if (CONFIRMED_STATUSES.includes(invoice.status)) {
      confirmedCount += 1;
    }
  }

  if (error) {
    return <p className="message error">{error}</p>;
  }

  return (
    <div>
      <div className="header-row">
        <div>
          <h1 className="page-title">My Invoices</h1>
          <p className="subtitle">Manage and track all submitted invoices.</p>
        </div>
        <div className="header-actions">
          <a
            className="btn-outline"
            href={API_URL + '/api/payouts/export.csv?supplierId=1'}
          >
            <Download size={15} />
            Export Report
          </a>
          <button className="btn-gradient" onClick={() => setRefreshKey(refreshKey + 1)}>
            <RefreshCw size={15} className={loading ? 'spinning' : ''} />
            Refresh Data
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard
          icon={FileText}
          label="Total Invoices"
          value={String(invoices.length)}
          change="+12.5%"
          colour="green"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Value"
          value={'৳ ' + totalValue.toLocaleString('en-IN')}
          change="+4.2%"
          colour="blue"
        />
        <StatCard
          icon={Clock}
          label="Pending"
          value={String(pendingCount)}
          colour="slate"
        />
        <StatCard
          icon={AlertTriangle}
          label="Confirmed"
          value={String(confirmedCount)}
          colour="teal"
        />
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-icon">
            <FileText size={18} />
          </span>
          <div>
            <p className="panel-title">Invoice Monitoring</p>
            <p className="panel-sub">
              {loading ? 'Loading...' : invoices.length + ' total invoices'}
            </p>
          </div>
        </div>

        <table className="ledger">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Supplier</th>
              <th>Buyer</th>
              <th className="right">Amount</th>
              <th>Due Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="empty-row">
                  No invoices found. Submit your first invoice above.
                </td>
              </tr>
            )}
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="invoice-number">{invoice.invoice_number || '—'}</td>
                <td className="buyer">{invoice.supplier_id || '—'}</td>
                <td>{invoice.buyer_name || '—'}</td>
                <td className="right received">{formatTaka(invoice.invoice_amount)}</td>
                <td className="buyer">{formatDate(invoice.due_date)}</td>
                <td>
                  <span className={chipClass(invoice.status)}>
                    {invoice.status || 'Unknown'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default MyInvoices;

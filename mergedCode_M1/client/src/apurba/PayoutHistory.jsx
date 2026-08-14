import { useEffect, useState } from 'react';

const API_URL = ''; // same-origin: Vite proxy forwards /api to the server (port 5000)
const SUPPLIER_ID = 1; // later this comes from the logged-in user

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 1250000 -> "৳ 12,50,000".  "en-IN" groups digits the way Bangladesh and
// India write money (lakh/crore), which is what Digonta's table uses too.
// An invoice that is not funded yet has no payout and no discount, so those
// arrive as null and we show a dash instead.
function formatTaka(amount) {
  if (amount === null) {
    return '—';
  }
  return '৳ ' + Number(amount).toLocaleString('en-IN');
}

// "2026-08-03" -> "03 Aug 2026"
// We split the text instead of using new Date(), because a Date would be
// shifted by the PC's time zone and could show the wrong day.
function formatDate(value) {
  if (value === null) {
    return '—';
  }
  const parts = value.split('-'); // ["2026", "08", "03"]
  return parts[2] + ' ' + MONTHS[Number(parts[1]) - 1] + ' ' + parts[0];
}

// "Payout Initiated" -> "chip chip-payout-initiated", so the CSS can colour it.
function chipClass(status) {
  return 'chip chip-' + status.toLowerCase().split(' ').join('-');
}

function PayoutHistory() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Runs once when the page opens: ask the backend for the ledger.
  useEffect(() => {
    fetch(API_URL + '/api/payouts?supplierId=' + SUPPLIER_ID)
      .then((response) => response.json())
      .then((data) => {
        setInvoices(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not reach the server. Is it running on port 4000?');
        setLoading(false);
      });
  }, []);

  // Add up the three totals shown in the cards at the top.
  // Every invoice counts towards "invoiced", but only the ones that were
  // actually funded have a payout and a discount to add up.
  let totalInvoiced = 0;
  let totalReceived = 0;
  let totalDiscount = 0;
  let fundedCount = 0;

  for (const invoice of invoices) {
    totalInvoiced += Number(invoice.invoice_amount);

    if (invoice.payout_amount !== null) {
      totalReceived += Number(invoice.payout_amount);
      totalDiscount += Number(invoice.discount_amount);
      fundedCount += 1;
    }
  }

  if (loading) {
    return <p className="message">Loading payout history...</p>;
  }

  if (error) {
    return <p className="message error">{error}</p>;
  }

  return (
    <div>
      <div className="header-row">
        <div>
          <h1>Payout history</h1>
          <p className="subtitle">
            Every invoice you have submitted through Clarity.
          </p>
        </div>

        {/* A plain link. The browser downloads it because of the
            Content-Disposition header the server sends back. */}
        <a
          className="download-button"
          href={API_URL + '/api/payouts/export.csv?supplierId=' + SUPPLIER_ID}
        >
          Download CSV
        </a>
      </div>

      <div className="cards">
        <div className="card">
          <span className="card-label">Total invoiced</span>
          <span className="card-value">{formatTaka(totalInvoiced)}</span>
        </div>
        <div className="card">
          <span className="card-label">Total received</span>
          <span className="card-value">{formatTaka(totalReceived)}</span>
        </div>
        <div className="card">
          <span className="card-label">Total discount paid</span>
          <span className="card-value">{formatTaka(totalDiscount)}</span>
        </div>
      </div>

      <div className="panel">
      <table className="ledger">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Buyer</th>
            <th>Status</th>
            <th className="right">Invoice amount</th>
            <th className="right">Payout received</th>
            <th className="right">Discount paid</th>
            <th>Funder</th>
            <th>Submitted</th>
            <th>Paid on</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td className="invoice-number">{invoice.invoice_number}</td>
              <td>{invoice.buyer_name === null ? '—' : invoice.buyer_name}</td>
              <td>
                <span className={chipClass(invoice.status)}>
                  {invoice.status}
                </span>
              </td>
              <td className="right">{formatTaka(invoice.invoice_amount)}</td>
              <td className="right received">
                {formatTaka(invoice.payout_amount)}
              </td>
              <td className="right discount">
                {formatTaka(invoice.discount_amount)}
              </td>
              <td>{invoice.funder_name === null ? '—' : invoice.funder_name}</td>
              <td>{formatDate(invoice.submitted_date)}</td>
              <td>{formatDate(invoice.payment_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <p className="row-count">
        {invoices.length} invoices submitted, {fundedCount} funded
      </p>
    </div>
  );
}

export default PayoutHistory;

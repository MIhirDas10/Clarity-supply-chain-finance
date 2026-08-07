import { useEffect, useState } from 'react';

const API_URL = 'http://localhost:4000';
const SUPPLIER_ID = 1; // later this comes from the logged-in user

// 1250000 -> "৳1,250,000"
function formatTaka(amount) {
  return '৳' + Number(amount).toLocaleString('en-US');
}

// "2026-08-03" -> "03 Aug 2026"
function formatDate(value) {
  const date = new Date(value);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function PayoutHistory() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Runs once when the page opens: ask the backend for the ledger.
  useEffect(() => {
    fetch(API_URL + '/api/payouts?supplierId=' + SUPPLIER_ID)
      .then((response) => response.json())
      .then((data) => {
        setPayouts(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not reach the server. Is it running on port 4000?');
        setLoading(false);
      });
  }, []);

  // Add up the three totals shown in the cards at the top.
  let totalInvoiced = 0;
  let totalReceived = 0;
  let totalDiscount = 0;

  for (const payout of payouts) {
    totalInvoiced += Number(payout.invoice_amount);
    totalReceived += Number(payout.payout_amount);
    totalDiscount += Number(payout.discount_amount);
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
            Every invoice you have funded through Clarity.
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

      <table className="ledger">
        <thead>
          <tr>
            <th>Invoice</th>
            <th className="right">Invoice amount</th>
            <th className="right">Payout received</th>
            <th className="right">Discount paid</th>
            <th>Funder</th>
            <th>Payment date</th>
          </tr>
        </thead>
        <tbody>
          {payouts.map((payout) => (
            <tr key={payout.id}>
              <td className="invoice-number">{payout.invoice_number}</td>
              <td className="right">{formatTaka(payout.invoice_amount)}</td>
              <td className="right received">
                {formatTaka(payout.payout_amount)}
              </td>
              <td className="right discount">
                {formatTaka(payout.discount_amount)}
              </td>
              <td>{payout.funder_name}</td>
              <td>{formatDate(payout.payment_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="row-count">{payouts.length} records</p>
    </div>
  );
}

export default PayoutHistory;

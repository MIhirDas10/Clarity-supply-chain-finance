import { useState } from 'react';
import { Upload, Zap, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const API_URL = 'http://localhost:4000';

// Platform discount: 2.5% if you want the money the same day, falling to 0%
// if you are happy to wait the full 30 days. The rate is prorated in between.
const DISCOUNT_RATE_30D = 0.025;
const MAX_DISCOUNT_DAYS = 30;

const EMPTY_FORM = {
  supplier_id: '',
  buyer_name: '',
  invoice_number: '',
  amount: '',
  due_date: '',
  file_url: '',
};

function formatBDT(value) {
  return '৳' + value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function InvoiceForm({ onSuccess }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [discountDays, setDiscountDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  function handleChange(field, value) {
    setForm({ ...form, [field]: value });
    setFeedback(null);
  }

  // Work out the payout as the slider moves.
  const fullAmount = parseFloat(form.amount) || 0;
  const discountPercent =
    (DISCOUNT_RATE_30D / MAX_DISCOUNT_DAYS) * (MAX_DISCOUNT_DAYS - discountDays);
  const discountedAmount = Math.round(fullAmount * (1 - discountPercent));
  const sliderFill = (discountDays / MAX_DISCOUNT_DAYS) * 100;

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const response = await fetch(API_URL + '/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          discount_days: discountDays,
          discounted_amount: discountedAmount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFeedback({ type: 'error', message: data.message || 'Something went wrong' });
        return;
      }

      setFeedback({ type: 'success', message: 'Invoice created successfully!' });
      setForm(EMPTY_FORM);
      setDiscountDays(0);
      onSuccess();
    } catch (error) {
      setFeedback({ type: 'error', message: 'Network error — please try again' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel form-card">
      <div className="form-card-head">
        <span className="form-card-icon">
          <Upload size={18} />
        </span>
        <div>
          <p className="panel-title">Upload New Invoice</p>
          <p className="panel-sub">Submit invoice details for processing</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Supplier ID</label>
            <input
              type="text"
              placeholder="e.g. SUP-006"
              required
              value={form.supplier_id}
              onChange={(e) => handleChange('supplier_id', e.target.value)}
            />
          </div>

          <div className="field">
            <label>Buyer Name</label>
            <input
              type="text"
              placeholder="e.g. Unilever BD"
              required
              value={form.buyer_name}
              onChange={(e) => handleChange('buyer_name', e.target.value)}
            />
          </div>

          <div className="field">
            <label>Invoice Number</label>
            <input
              type="text"
              placeholder="e.g. INV-1006"
              required
              value={form.invoice_number}
              onChange={(e) => handleChange('invoice_number', e.target.value)}
            />
          </div>

          <div className="field">
            <label>Amount (৳)</label>
            <input
              type="number"
              placeholder="e.g. 2500000"
              required
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
            />
          </div>

          <div className="field">
            <label>Due Date</label>
            <input
              type="date"
              required
              value={form.due_date}
              onChange={(e) => handleChange('due_date', e.target.value)}
            />
          </div>

          <div className="field">
            <label>
              File URL <span className="label-optional">(optional)</span>
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={form.file_url}
              onChange={(e) => handleChange('file_url', e.target.value)}
            />
          </div>
        </div>

        {/* ---------- early payment discount ---------- */}
        <div className="discount-box">
          <div className="discount-head">
            <span className="discount-icon">
              <Zap size={14} />
            </span>
            <div>
              <p className="discount-title">Early Payment Discount</p>
              <p className="discount-sub">Slide to choose how soon you want to get paid</p>
            </div>
          </div>

          <div className="slider-labels">
            <span className="slider-caption">Payment Timeline</span>
            <span className="slider-value">
              {discountDays === 0
                ? 'Same-day'
                : discountDays + (discountDays > 1 ? ' days' : ' day')}
            </span>
          </div>

          <input
            className="clarity-slider"
            type="range"
            min={0}
            max={MAX_DISCOUNT_DAYS}
            step={1}
            value={discountDays}
            onChange={(e) => setDiscountDays(Number(e.target.value))}
            style={{
              background:
                'linear-gradient(to right, #0F172A 0%, #0F172A ' + sliderFill +
                '%, #E2E8F0 ' + sliderFill + '%, #E2E8F0 100%)',
            }}
          />

          <div className="slider-ticks">
            <span>0 days</span>
            <span>15 days</span>
            <span>30 days</span>
          </div>

          {fullAmount > 0 && (
            <div className="discount-result">
              <p>
                Receive <strong>{formatBDT(discountedAmount)}</strong> today instead of{' '}
                <strong>{formatBDT(fullAmount)}</strong> in{' '}
                <strong>{discountDays}</strong> days
              </p>
              {discountPercent > 0 && (
                <p className="discount-note">
                  Platform discount: {(discountPercent * 100).toFixed(2)}% &middot; You save{' '}
                  {formatBDT(fullAmount - discountedAmount)} in waiting time
                </p>
              )}
            </div>
          )}
        </div>

        {feedback && (
          <div className={'banner banner-' + (feedback.type === 'success' ? 'ok' : 'bad')}>
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {feedback.message}
          </div>
        )}

        <div className="form-submit">
          <button className="submit-button" type="submit" disabled={loading}>
            {loading ? <Loader2 size={16} className="spinning" /> : <Upload size={16} />}
            {loading ? 'Submitting...' : 'Submit Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default InvoiceForm;

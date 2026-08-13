import { useState } from 'react';
import Tesseract from 'tesseract.js';

const API_URL = ''; // same-origin: Vite proxy forwards /api to the server (port 5000)
const SUPPLIER_ID = 1; // later this comes from the logged-in user

// ---------------------------------------------------------------------------
// Reading the invoice
//
// Tesseract gives us the whole invoice as one block of plain text. These
// patterns then pick the four fields we need out of that text. Each field has
// more than one pattern because different companies label things differently -
// "Invoice No", "Invoice #", "INV-2026-1042" on its own, and so on.
// ---------------------------------------------------------------------------

const INVOICE_NUMBER_PATTERNS = [
  /invoice\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Za-z0-9\/-]+)/i,
  /\b(INV[-\s]?[A-Za-z0-9-]{3,})\b/i,
];

const AMOUNT_PATTERNS = [
  /(?:grand\s*total|total\s*amount|amount\s*due|total\s*due)\s*[:\-]?\s*(?:BDT|Tk\.?|৳)?\s*([\d][\d,\s]*(?:\.\d{1,2})?)/i,
  /\btotal\b\s*[:\-]?\s*(?:BDT|Tk\.?|৳)?\s*([\d][\d,\s]*(?:\.\d{1,2})?)/i,
];

const DUE_DATE_PATTERNS = [
  /due\s*date\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i,
  /due\s*date\s*[:\-]?\s*(\d{1,2}[\/\-\s][A-Za-z0-9]+[\/\-\s]\d{2,4})/i,
  /payment\s*due\s*[:\-]?\s*(\d{1,2}[\/\-\s][A-Za-z0-9]+[\/\-\s]\d{2,4})/i,
];

const BUYER_PATTERNS = [
  /(?:bill(?:ed)?\s*to|sold\s*to|buyer|customer)\s*[:\-]?\s*(.+)/i,
];

// Try each pattern in turn and return the first thing that matches.
function findFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return '';
}

// "1,25,000.00" -> "125000.00"   (strip the commas and spaces OCR leaves behind)
function cleanAmount(value) {
  return value.split(',').join('').split(' ').join('');
}

// Whatever date the invoice used -> "2026-10-12", which is what a date input needs.
function toISODate(value) {
  if (!value) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = Date.parse(value);
  if (isNaN(parsed)) {
    return '';
  }
  const date = new Date(parsed);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

function InvoiceUpload() {
  const [preview, setPreview] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reading, setReading] = useState(false);
  const [rawText, setRawText] = useState('');
  const [autoFilled, setAutoFilled] = useState([]);
  const [message, setMessage] = useState(null);

  // The form the supplier reviews before submitting.
  const [form, setForm] = useState({
    buyer_name: '',
    invoice_number: '',
    invoice_amount: '',
    due_date: '',
  });

  function updateField(name, value) {
    setForm({ ...form, [name]: value });
  }

  async function handleFile(file) {
    if (!file) {
      return;
    }

    setMessage(null);

    if (file.type === 'application/pdf') {
      setMessage({
        kind: 'bad',
        text: 'PDFs cannot be read directly. Save the invoice as a PNG or JPG photo and upload that.',
      });
      return;
    }

    setFileName(file.name);
    setPreview(URL.createObjectURL(file));
    setReading(true);
    setProgress(0);
    setRawText('');
    setAutoFilled([]);

    try {
      // This is the OCR step. Tesseract reads the picture and hands back text.
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (info) => {
          if (info.status === 'recognizing text') {
            setProgress(Math.round(info.progress * 100));
          }
        },
      });

      const text = result.data.text;
      setRawText(text);

      const buyer = findFirst(text, BUYER_PATTERNS);
      const number = findFirst(text, INVOICE_NUMBER_PATTERNS);
      const amount = findFirst(text, AMOUNT_PATTERNS);
      const due = findFirst(text, DUE_DATE_PATTERNS);

      const filled = [];
      if (buyer) filled.push('buyer_name');
      if (number) filled.push('invoice_number');
      if (amount) filled.push('invoice_amount');
      if (due) filled.push('due_date');

      setForm({
        buyer_name: buyer,
        invoice_number: number,
        invoice_amount: amount ? cleanAmount(amount) : '',
        due_date: toISODate(due),
      });
      setAutoFilled(filled);

      if (filled.length === 0) {
        setMessage({
          kind: 'bad',
          text: 'Nothing could be read from that image. Type the details in by hand, or try a clearer photo.',
        });
      }
    } catch (error) {
      setMessage({ kind: 'bad', text: 'Could not read the image: ' + error.message });
    }

    setReading(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage(null);

    try {
      const response = await fetch(API_URL + '/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: SUPPLIER_ID,
          buyer_name: form.buyer_name,
          invoice_number: form.invoice_number,
          invoice_amount: form.invoice_amount,
          due_date: form.due_date,
          file_name: fileName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ kind: 'bad', text: data.message });
        return;
      }

      setMessage({
        kind: 'ok',
        text: 'Invoice ' + data.invoice_number + ' submitted. It now appears in your payout history.',
      });
      setForm({ buyer_name: '', invoice_number: '', invoice_amount: '', due_date: '' });
      setPreview('');
      setFileName('');
      setRawText('');
      setAutoFilled([]);
    } catch (error) {
      setMessage({ kind: 'bad', text: 'Could not reach the server. Is it running on port 4000?' });
    }
  }

  const ready =
    form.buyer_name && form.invoice_number && form.invoice_amount && form.due_date;

  return (
    <div>
      <div className="header-row">
        <div>
          <h1>Upload invoice</h1>
          <p className="subtitle">
            The details are read off the document automatically. Check them before submitting.
          </p>
        </div>
      </div>

      {message && (
        <div className={message.kind === 'ok' ? 'banner banner-ok' : 'banner banner-bad'}>
          {message.text}
        </div>
      )}

      <div className="upload-grid">
        {/* ---------- left: the file ---------- */}
        <div className="upload-col">
          <label
            className={dragging ? 'dropzone dragging' : 'dropzone'}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files[0]);
            }}
          >
            <span className="dropzone-icon">🧾</span>
            <p className="dropzone-title">Drag and drop the invoice here</p>
            <p className="dropzone-hint">PNG or JPG photo &middot; or click to browse</p>
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </label>

          {reading && (
            <>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: progress + '%' }} />
              </div>
              <p className="progress-label">Reading the invoice... {progress}%</p>
            </>
          )}

          {preview && <img className="preview" src={preview} alt="invoice" />}

          {rawText && (
            <details className="raw-text">
              <summary>Show the raw text the OCR read</summary>
              <pre>{rawText}</pre>
            </details>
          )}
        </div>

        {/* ---------- right: the form ---------- */}
        <div className="upload-col">
          <form className="form-panel" onSubmit={handleSubmit}>
            <p className="form-title">Extracted details</p>
            <p className="form-hint">
              {autoFilled.length > 0
                ? autoFilled.length + ' of 4 fields filled in automatically. Correct anything that is wrong.'
                : 'Upload an invoice, or type the details in by hand.'}
            </p>

            <div className="field">
              <label>Buyer name</label>
              <input
                value={form.buyer_name}
                onChange={(e) => updateField('buyer_name', e.target.value)}
              />
              {autoFilled.includes('buyer_name') && <p className="field-note">read from the invoice</p>}
            </div>

            <div className="field">
              <label>Invoice number</label>
              <input
                value={form.invoice_number}
                onChange={(e) => updateField('invoice_number', e.target.value)}
              />
              {autoFilled.includes('invoice_number') && <p className="field-note">read from the invoice</p>}
            </div>

            <div className="field">
              <label>Total amount (BDT)</label>
              <input
                value={form.invoice_amount}
                onChange={(e) => updateField('invoice_amount', e.target.value)}
              />
              {autoFilled.includes('invoice_amount') && <p className="field-note">read from the invoice</p>}
            </div>

            <div className="field">
              <label>Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => updateField('due_date', e.target.value)}
              />
              {autoFilled.includes('due_date') && <p className="field-note">read from the invoice</p>}
            </div>

            <button className="button" type="submit" disabled={!ready || reading}>
              Confirm and submit
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default InvoiceUpload;

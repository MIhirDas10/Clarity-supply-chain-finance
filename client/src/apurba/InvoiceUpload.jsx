import { useEffect, useState } from 'react';
import Tesseract from 'tesseract.js';

const API_URL = ''; // same-origin: the Vite proxy forwards /api to the server

// ---------------------------------------------------------------------------
// Reading the invoice
//
// We end up with the whole invoice as one block of plain text, whether it came
// from a PDF or from a photograph. These patterns then pick the four fields we
// need out of that text. Each field has more than one pattern because different
// companies label things differently - "Invoice No", "Invoice #", and so on.
// ---------------------------------------------------------------------------

// The invoice number may be written with spaces in it - "INV 2026 1099" - so
// after the first chunk we allow up to three more, but only if each one
// contains a digit. That stops the match running on into the next label:
// in "Invoice No: INV-1042 Date: 12 Aug" the word "Date" has no digit, so
// the capture stops at INV-1042.
const INVOICE_NUMBER_PATTERNS = [
  /invoice\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/-]*(?:[ ][A-Za-z0-9\/-]*\d[A-Za-z0-9\/-]*){0,3})/i,
  /\b(INV[-\s]?[A-Za-z0-9-]{3,})\b/i,
];

const AMOUNT_PATTERNS = [
  /(?:grand\s*total|total\s*amount|amount\s*due|total\s*due)\s*[:\-]?\s*(?:BDT|Tk\.?|৳)?\s*([\d][\d,\s]*(?:\.\d{1,2})?)/i,
  /\btotal\b\s*[:\-]?\s*(?:BDT|Tk\.?|৳)?\s*([\d][\d,\s]*(?:\.\d{1,2})?)/i,
];

// All three ways of labelling the date share the same two value shapes, so
// the labels are grouped rather than repeated - otherwise "Payment Due" only
// matched one of the two formats, which was a real bug.
const DUE_DATE_LABEL = /(?:due\s*date|payment\s*due|date\s*due)/;

const DUE_DATE_PATTERNS = [
  new RegExp(DUE_DATE_LABEL.source + /\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/.source, 'i'),
  new RegExp(DUE_DATE_LABEL.source + /\s*[:\-]?\s*(\d{1,2}[\/\-\s][A-Za-z0-9]+[\/\-\s]\d{2,4})/.source, 'i'),
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

  // Already in the right shape.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // All-numeric dates are read DAY FIRST, because Bangladesh writes
  // 05/09/2026 to mean 5 September. Date.parse() would read that American
  // style as 9 May - the wrong month, silently, on a financial document.
  const numeric = value.match(/^(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{2,4})$/);
  if (numeric) {
    const day = numeric[1].padStart(2, '0');
    const month = numeric[2].padStart(2, '0');
    const year = numeric[3].length === 2 ? '20' + numeric[3] : numeric[3];

    if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) {
      return '';
    }
    return year + '-' + month + '-' + day;
  }

  // Anything with a month name in it ("10 Nov 2026") is unambiguous, so the
  // built-in parser is safe here.
  const parsed = Date.parse(value);
  if (isNaN(parsed)) {
    return '';
  }
  const date = new Date(parsed);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

// pdf.js hands back every scrap of text separately, with no line breaks. The
// patterns above rely on lines, so we rebuild them: each scrap carries its
// position on the page, and a change in the vertical position means a new line.
function joinTextItems(items) {
  let text = '';
  let lastY = null;

  for (const item of items) {
    const y = item.transform[5];

    if (lastY !== null && Math.abs(y - lastY) > 2) {
      text += '\n';
    } else if (text !== '') {
      text += ' ';
    }

    text += item.str;
    lastY = y;
  }

  return text;
}

function InvoiceUpload() {
  const [preview, setPreview] = useState('');
  const [fileName, setFileName] = useState('');
  const [file, setFile] = useState(null); // kept so it can be stored on submit
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reading, setReading] = useState(false);
  const [stage, setStage] = useState('');
  const [source, setSource] = useState('');
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

  const [duplicate, setDuplicate] = useState(null);

  function updateField(name, value) {
    setForm({ ...form, [name]: value });
  }

  // The same invoice must never be financed twice, so as soon as we have an
  // invoice number we ask the server whether it has been submitted before.
  // This happens while the supplier is still reviewing, not after they submit.
  useEffect(() => {
    setDuplicate(null);
    if (!form.invoice_number) return;

    const timer = setTimeout(() => {
      fetch(API_URL + '/api/invoices/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_number: form.invoice_number }),
      })
        .then((r) => r.json())
        .then((result) => setDuplicate(result.duplicate ? result.existing : null))
        .catch(() => {});
    }, 300);

    return () => clearTimeout(timer);
  }, [form.invoice_number]);

  // Run the OCR engine over an image or a canvas.
  async function runOcr(image) {
    setStage('Reading the text');
    const result = await Tesseract.recognize(image, 'eng', {
      logger: (info) => {
        if (info.status === 'recognizing text') {
          setProgress(Math.round(info.progress * 100));
        }
      },
    });
    return result.data.text;
  }

  // A PDF exported from accounting software already contains its text, so we
  // read that directly - it is exact, and far faster than OCR. Only a PDF that
  // is really a scanned photograph needs the OCR engine.
  async function readPdf(file) {
    setStage('Opening the PDF');

    // pdf.js is a large library, so it is only downloaded when someone
    // actually opens a PDF. Anyone uploading a photograph never pays for it.
    // Its background worker is bundled with the app rather than fetched from
    // a web address, so this still works with no internet connection.
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const page = await pdf.getPage(1);

    // Draw page one so the supplier can see what was uploaded.
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    setPreview(canvas.toDataURL());

    const content = await page.getTextContent();
    const layerText = joinTextItems(content.items);

    if (layerText.trim().length > 40) {
      setSource('read straight from the PDF');
      return layerText;
    }

    // Almost no text in the file, so it is a scan. Fall back to OCR.
    setSource('scanned PDF, read by OCR');
    return runOcr(canvas);
  }

  async function handleFile(file) {
    if (!file) {
      return;
    }

    setMessage(null);
    setFile(file);
    setFileName(file.name);
    setReading(true);
    setProgress(0);
    setStage('');
    setSource('');
    setRawText('');
    setAutoFilled([]);
    setPreview('');

    try {
      let text = '';

      if (file.type === 'application/pdf') {
        text = await readPdf(file);
      } else {
        setPreview(URL.createObjectURL(file));
        setSource('photograph, read by OCR');
        text = await runOcr(file);
      }

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
          text: 'Nothing could be read from that file. Type the details in by hand, or try a clearer copy.',
        });
      }
    } catch (error) {
      setMessage({ kind: 'bad', text: 'Could not read that file: ' + error.message });
    }

    setStage('');
    setReading(false);
  }

  // Turns the chosen file into a data URI, which is what the upload endpoint
  // expects. FileReader is callback based, so it is wrapped in a Promise to
  // keep handleSubmit readable.
  function readAsDataUri(theFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the file'));
      reader.readAsDataURL(theFile);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage(null);
    setSaving(true);

    try {
      // Store the document first. Only if that succeeds do we save the
      // invoice, so we never record an invoice whose document went missing.
      let documentUrl = null;

      if (file) {
        setStage('Storing the document');
        const stored = await fetch(API_URL + '/api/invoices/upload-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file: await readAsDataUri(file),
            file_name: fileName,
          }),
        });
        const storedData = await stored.json();

        if (!stored.ok) {
          setStage('');
          setSaving(false);
          return setMessage({ kind: 'bad', text: storedData.message });
        }
        documentUrl = storedData.file_url;
        setStage('');
      }

      const response = await fetch(API_URL + '/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_name: form.buyer_name,
          invoice_number: form.invoice_number,
          invoice_amount: form.invoice_amount,
          due_date: form.due_date,
          file_url: documentUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ kind: 'bad', text: data.message });
        return;
      }

      setMessage({
        kind: 'ok',
        text: 'Invoice ' + data.invoice_number + ' submitted' +
              (documentUrl ? ' and the document was stored.' : '.'),
      });
      setForm({ buyer_name: '', invoice_number: '', invoice_amount: '', due_date: '' });
      setPreview('');
      setFile(null);
      setFileName('');
      setRawText('');
      setSource('');
      setAutoFilled([]);
    } catch (error) {
      setMessage({ kind: 'bad', text: 'Could not reach the server.' });
    }

    setStage('');
    setSaving(false);
  }

  // A duplicate blocks the submit button, so the same invoice cannot be
  // financed twice.
  const ready =
    form.buyer_name && form.invoice_number && form.invoice_amount && form.due_date && !duplicate;

  return (
    <div>
      <div className="header-row">
        <div>
          <h1 className="page-title">Upload invoice</h1>
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
            <p className="dropzone-hint">PDF, PNG or JPG &middot; or click to browse</p>
            <input
              type="file"
              accept="application/pdf,image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </label>

          {reading && (
            <>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: (progress || 6) + '%' }} />
              </div>
              <p className="progress-label">
                {stage}{progress > 0 ? '... ' + progress + '%' : '...'}
              </p>
            </>
          )}

          {preview && <img className="preview" src={preview} alt="invoice" />}

          {rawText && (
            <details className="raw-text">
              <summary>Show the text that was read{source ? ' (' + source + ')' : ''}</summary>
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
              {duplicate ? (
                <p className="field-warning">
                  Already submitted on {duplicate.submitted_date} for{' '}
                  {duplicate.buyer_name} — this invoice cannot be financed twice.
                </p>
              ) : (
                autoFilled.includes('invoice_number') && <p className="field-note">read from the invoice</p>
              )}
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

            <button className="submit-button" type="submit" disabled={!ready || reading || saving}>
              Confirm and submit
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default InvoiceUpload;

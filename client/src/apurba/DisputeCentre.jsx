// Feature 02 - Dispute Filing & Invoice Freeze   (Apurba Roy, SL 3)
//
// Left side: a buyer files a dispute against an invoice, which freezes it.
// Right side: the admin reads the evidence and either releases the invoice
// back to the marketplace or voids it for good.

import { useEffect, useState } from 'react';
import { ShieldAlert, Snowflake } from 'lucide-react';
import { API_URL } from './api.js';
import { useAuth } from '../auth/AuthContext.jsx';

function DisputeCentre() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState(null);
  const [refresh, setRefresh] = useState(0);

  const [form, setForm] = useState({
    invoice_id: '', filed_by: user?.business_name || '', reason: '', notes: '',
  });
  const [evidence, setEvidence] = useState({ note: '' });
  const [document, setDocument] = useState(null);   // the file the buyer chose
  const [uploading, setUploading] = useState(false);

  // Helper for auth headers
  const getHeaders = (extraHeaders = {}) => ({
    ...extraHeaders,
    'Authorization': 'Bearer ' + localStorage.getItem('clarity_token')
  });

  // Reload the invoice list and the dispute list together.
  useEffect(() => {
    fetch(API_URL + '/api/invoices', { headers: getHeaders() })
      .then((r) => r.json())
      .then((list) => {
        setInvoices(list || []);
        if (list && list.length > 0 && !form.invoice_id) {
          setForm((f) => ({ ...f, invoice_id: list[0].id }));
        }
      })
      .catch(() => setMessage({ bad: true, text: 'Could not reach the server on port 1012.' }));

    fetch(API_URL + '/api/disputes', { headers: getHeaders() })
      .then((r) => r.json())
      .then((list) => setDisputes(list || []))
      .catch(() => {});
  }, [refresh]);

  // Load one dispute with its documents and history.
  function open(id) {
    fetch(API_URL + '/api/disputes/' + id, { headers: getHeaders() })
      .then((r) => r.json())
      .then(setSelected);
  }

  async function file(event) {
    event.preventDefault();
    const res = await fetch(API_URL + '/api/disputes', {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...form, filed_by: user?.business_name || form.filed_by }),
    });
    const data = await res.json();

    if (!res.ok) {
      return setMessage({ bad: true, text: data.message });
    }
    setMessage({ bad: false, text: 'Dispute #' + data.id + ' filed. The invoice is now frozen.' });
    setForm({ ...form, reason: '', notes: '' });
    setRefresh(refresh + 1);
    open(data.id);
  }

  // Reads the chosen file into the data URI the upload endpoint expects.
  function readAsDataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the file'));
      reader.readAsDataURL(file);
    });
  }

  // Two steps: put the file in Cloudinary, then record the link it gives back
  // against the dispute. The dispute table only ever stores the link.
  async function addEvidence(event) {
    event.preventDefault();
    setMessage(null);

    if (!document) {
      return setMessage({ bad: true, text: 'Choose a document first.' });
    }

    setUploading(true);
    try {
      const stored = await fetch(API_URL + '/api/invoices/upload-file', {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          file: await readAsDataUri(document),
          file_name: document.name,
        }),
      });
      const storedData = await stored.json();

      if (!stored.ok) {
        return setMessage({ bad: true, text: storedData.message });
      }

      const res = await fetch(API_URL + '/api/disputes/' + selected.id + '/evidence', {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          uploaded_by: user?.business_name || selected.filed_by,
          file_url: storedData.file_url,
          note: evidence.note || document.name,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        return setMessage({ bad: true, text: data.message });
      }

      setEvidence({ note: '' });
      setDocument(null);
      open(selected.id);
    } catch (error) {
      setMessage({ bad: true, text: 'Could not upload that document.' });
    } finally {
      setUploading(false);
    }
  }

  async function resolve(decision) {
    const res = await fetch(API_URL + '/api/disputes/' + selected.id + '/resolve', {
      method: 'PATCH',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        decision: decision,
        resolution_note: decision === 'released' ? 'Evidence accepted' : 'Invoice cancelled',
        actor: user?.email || 'admin@clarity.io',
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      return setMessage({ bad: true, text: data.message });
    }
    setMessage({
      bad: false,
      text: decision === 'released'
        ? 'Released. The invoice is unfrozen and back on the marketplace.'
        : 'Voided. The invoice stays frozen permanently.',
    });
    setRefresh(refresh + 1);
    open(selected.id);
  }

  return (
    <div>
      <div className="header-row">
        <div>
          <h1 className="page-title">Dispute centre</h1>
          <p className="subtitle">
            Filing a dispute freezes the invoice so nobody can fund it.
          </p>
        </div>
      </div>

      {message && (
        <div className={'banner ' + (message.bad ? 'banner-bad' : 'banner-ok')}>
          {message.text}
        </div>
      )}

      <div className="upload-grid">
        {/* ---------- left: file a dispute, and the queue ---------- */}
        <div className="upload-col">
          <form className="panel form-card" onSubmit={file}>
            <div className="form-card-head">
              <span className="form-card-icon"><ShieldAlert size={18} /></span>
              <div>
                <p className="panel-title">File a dispute</p>
                <p className="panel-sub">The buyer raises a problem with an invoice</p>
              </div>
            </div>

            <div className="field">
              <label>Invoice</label>
              <select
                value={form.invoice_id}
                onChange={(e) => setForm({ ...form, invoice_id: e.target.value })}
              >
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoice_number} — {i.buyer_name} — ৳{Number(i.invoice_amount).toLocaleString('en-IN')}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Filed by</label>
              <input
                value={user?.business_name || form.filed_by}
                disabled
              />
            </div>

            <div className="field">
              <label>Reason</label>
              <input
                placeholder="e.g. Goods not delivered as specified"
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Notes</label>
              <input
                placeholder="e.g. Only 380 of 500 units arrived"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <button className="submit-button" type="submit">
              <Snowflake size={16} /> File and freeze
            </button>
          </form>

          <div className="panel">
            <div className="panel-head">
              <span className="panel-icon"><ShieldAlert size={18} /></span>
              <div>
                <p className="panel-title">Dispute queue</p>
                <p className="panel-sub">{disputes.length} in total</p>
              </div>
            </div>
            <table className="ledger">
              <thead>
                <tr><th>#</th><th>Reason</th><th>Status</th></tr>
              </thead>
              <tbody>
                {disputes.length === 0 && (
                  <tr><td colSpan={3} className="empty-row">No disputes yet.</td></tr>
                )}
                {disputes.map((d) => (
                  <tr key={d.id} onClick={() => open(d.id)} style={{ cursor: 'pointer' }}>
                    <td className="invoice-number">{d.id}</td>
                    <td>{d.reason}</td>
                    <td><span className={'chip chip-' + d.status.toLowerCase()}>{d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------- right: the selected dispute ---------- */}
        <div className="upload-col">
          <div className="panel form-card">
            <p className="form-title">Dispute detail</p>

            {!selected ? (
              <p className="form-hint">Click a dispute in the queue to open it.</p>
            ) : (
              <>
                <p className="form-hint">
                  #{selected.id} · {selected.reason} ·{' '}
                  <span className={'chip chip-' + selected.status.toLowerCase()}>
                    {selected.status}
                  </span>
                </p>

                {selected.status === 'Open' && (
                  <>
                    <form onSubmit={addEvidence}>
                      <div className="field">
                        <label>Supporting document</label>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => setDocument(e.target.files[0] || null)}
                        />
                        <p className="field-note">
                          {document
                            ? document.name + ' — will be stored in Cloudinary'
                            : 'A delivery note, a photograph of the goods, a signed receipt.'}
                        </p>
                      </div>
                      <div className="field">
                        <label>Note</label>
                        <input
                          placeholder="e.g. Signed delivery note showing 380 units"
                          value={evidence.note}
                          onChange={(e) => setEvidence({ ...evidence, note: e.target.value })}
                        />
                      </div>
                      <button className="btn-outline" type="submit" disabled={!document || uploading}>
                        {uploading ? 'Uploading…' : 'Attach document'}
                      </button>
                    </form>

                    <div className="form-submit" style={{ gap: 10 }}>
                      <button className="btn-outline" onClick={() => resolve('released')}>
                        Release invoice
                      </button>
                      <button className="submit-button" onClick={() => resolve('voided')}>
                        Void invoice
                      </button>
                    </div>
                  </>
                )}

                <p className="form-title" style={{ marginTop: 18 }}>
                  Documents ({selected.evidence.length})
                </p>
                {selected.evidence.length === 0 && <p className="form-hint">None attached.</p>}
                {selected.evidence.map((e) => (
                  <p key={e.id} className="discount-note">
                    <a href={e.file_url} target="_blank" rel="noreferrer">
                      {e.note || 'Document'}
                    </a>{' '}
                    — stored in Cloudinary
                  </p>
                ))}

                <p className="form-title" style={{ marginTop: 18 }}>History</p>
                {selected.events.map((e) => (
                  <p key={e.id} className="discount-note">{e.event} — {e.actor}</p>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DisputeCentre;

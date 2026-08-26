import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import './auth.css';

function AdminDashboard() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // Document Viewer State
  const [viewingDocsUserId, setViewingDocsUserId] = useState(null);
  const [viewingDocsUser, setViewingDocsUser] = useState(null);
  const [userDocs, setUserDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  function authedFetch(url, options) {
    return fetch(url, {
      ...options,
      headers: { ...(options && options.headers), Authorization: 'Bearer ' + token },
    });
  }

  function load() {
    setLoading(true);
    authedFetch('/api/auth/users')
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function decide(id, decision) {
    setMessage('');
    const res = await authedFetch('/api/auth/' + id + '/' + decision, { method: 'PATCH' });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message);
      return;
    }
    load();
  }

  async function viewUserDocs(user) {
    setViewingDocsUserId(user.id);
    setViewingDocsUser(user);
    setLoadingDocs(true);
    try {
      const res = await authedFetch(`/api/documents/user/${user.id}`);
      const data = await res.json();
      if (res.ok) {
        setUserDocs(data);
      } else {
        setUserDocs([]);
      }
    } catch (err) {
      console.error(err);
      setUserDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  }

  async function togglePause(user, reason = null) {
    const action = user.is_paused ? 'unpause' : 'pause';
    const body = reason ? JSON.stringify({ reason }) : undefined;
    const headers = reason ? { 'Content-Type': 'application/json' } : undefined;
    
    const res = await authedFetch(`/api/auth/${user.id}/${action}`, {
      method: 'PATCH',
      headers,
      body,
    });
    
    if (res.ok) {
      load();
    }
  }

  async function updateDocStatus(docId, newStatus) {
    try {
      const res = await authedFetch(`/api/documents/${docId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updatedDoc = await res.json();
        setUserDocs(docs => docs.map(d => d.id === docId ? updatedDoc : d));
      }
    } catch (err) {
      console.error('Failed to update doc status:', err);
    }
  }

  function closeDocs() {
    setViewingDocsUserId(null);
    setViewingDocsUser(null);
    setUserDocs([]);
  }

  const pending = users.filter((u) => u.status === 'Pending');

  return (
    <div className="auth-admin-page" style={{ maxWidth: 1400, display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <ShieldCheck size={22} color="#0F172A" />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            Admin — KYB Approvals
          </h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Review new supplier and buyer applications. Unapproved accounts cannot log in.
        </p>

      {message && <div className="auth-banner bad">{message}</div>}

      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '18px 0 8px' }}>
        Pending applications ({pending.length})
      </h2>

      <table className="auth-admin-table" style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>Business</th>
            <th>Role</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Applied</th>
            <th>Documents</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {!loading && pending.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                Nothing waiting for review.
              </td>
            </tr>
          )}
          {pending.map((u) => (
            <tr key={u.id}>
              <td>{u.business_name}</td>
              <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
              <td>{u.email}</td>
              <td>{u.phone || '—'}</td>
              <td>{new Date(u.created_at).toLocaleDateString()}</td>
              <td>
                {u.role.toLowerCase() === 'funder' ? (
                  <button 
                    onClick={() => viewUserDocs(u)}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition"
                  >
                    View Docs
                  </button>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="auth-approve-btn" onClick={() => decide(u.id, 'approve')}>
                  Approve
                </button>
                <button className="auth-reject-btn" onClick={() => decide(u.id, 'reject')}>
                  Reject
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '18px 0 8px' }}>
        All accounts ({users.length})
      </h2>

      <table className="auth-admin-table">
        <thead>
          <tr>
            <th>Business</th>
            <th>Role</th>
            <th>Email</th>
            <th>Documents</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.business_name}</td>
              <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
              <td>{u.email}</td>
              <td>
                {u.role.toLowerCase() === 'funder' ? (
                  <button 
                    onClick={() => viewUserDocs(u)}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition"
                  >
                    View Docs
                  </button>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td>
                <span className={'auth-chip ' + u.status}>{u.status}</span>
                {u.is_paused && <span style={{ marginLeft: 4, background: '#fee2e2', color: '#991b1b' }} className="auth-chip">Paused</span>}
              </td>
              <td>
                {u.status === 'Approved' && (
                  <button 
                    onClick={() => togglePause(u)}
                    className={`px-3 py-1 rounded text-xs font-medium transition ${
                      u.is_paused 
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200' 
                        : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200'
                    }`}
                  >
                    {u.is_paused ? 'Unpause' : 'Pause'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Document Viewer Side Panel */}
      <div className="w-96 shrink-0 sticky top-8">
        <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-900">
              {viewingDocsUser ? `Docs: ${viewingDocsUser.business_name}` : 'KYB Documents'}
            </h2>
            <div className="flex gap-2 items-center">
              {viewingDocsUser && !viewingDocsUser.is_paused && viewingDocsUser.status === 'Approved' && (
                <button 
                  onClick={() => togglePause(viewingDocsUser, 'Admin requested additional KYB documents.')}
                  className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-xs font-medium transition"
                  title="Pause this user and request more documents"
                >
                  Request Docs
                </button>
              )}
              {viewingDocsUserId && (
                <button onClick={closeDocs} className="text-slate-500 hover:text-slate-800 font-medium text-sm ml-2">
                  Clear
                </button>
              )}
            </div>
          </div>
          
          {!viewingDocsUserId ? (
            <p className="text-slate-500 text-sm text-center py-8">Select a funder to view their documents.</p>
          ) : loadingDocs ? (
            <p className="text-slate-500 p-4 text-center text-sm">Loading documents...</p>
          ) : userDocs.length === 0 ? (
            <p className="text-slate-500 p-4 text-center text-sm">No documents found for this user.</p>
          ) : (
            <div className="space-y-4">
              {userDocs.map(doc => {
                const downloadUrl = doc.file_url?.includes('cloudinary.com') 
                  ? doc.file_url.replace('/upload/', '/upload/fl_attachment/')
                  : doc.file_url;
                  
                return (
                <div key={doc.id} className="p-4 border border-slate-200 rounded-lg flex flex-col gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm flex items-center">
                      {doc.doc_type}
                      <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        doc.status === 'Approved' ? 'bg-green-100 text-green-800' :
                        doc.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {doc.status || 'Pending'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 truncate">{doc.file_name || 'Document'}</p>
                    {doc.notes && <p className="text-xs text-slate-600 mt-1">{doc.notes}</p>}
                    <p className="text-[10px] text-slate-400 mt-2">
                      Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex justify-between items-center mt-1 pt-3 border-t border-slate-100">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => updateDocStatus(doc.id, 'Approved')}
                        className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded text-xs font-medium transition"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => updateDocStatus(doc.id, 'Rejected')}
                        className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded text-xs font-medium transition"
                      >
                        Reject
                      </button>
                    </div>
                    <a 
                      href={downloadUrl} 
                      download={doc.file_name || 'document'}
                      className="px-4 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs font-medium transition whitespace-nowrap"
                    >
                      Download
                    </a>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;

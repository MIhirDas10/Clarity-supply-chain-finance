import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import './auth.css';

function AdminDashboard() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

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

  const pending = users.filter((u) => u.status === 'Pending');

  return (
    <div className="auth-admin-page">
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
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {!loading && pending.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
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
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.business_name}</td>
              <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
              <td>{u.email}</td>
              <td>
                <span className={'auth-chip ' + u.status}>{u.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminDashboard;

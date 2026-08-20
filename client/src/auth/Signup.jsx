import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, ShoppingBag } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import './auth.css';

// Admin is deliberately not offered here. Letting anyone tick "Admin" on a
// public signup form would hand them full platform control - real admin
// accounts are seeded or promoted by an existing admin, never self-served.
const ROLES = [
  { value: 'supplier', label: 'Supplier', icon: Truck },
  { value: 'buyer', label: 'Buyer', icon: ShoppingBag },
];

function Signup() {
  const { signup } = useAuth();

  const [role, setRole] = useState('supplier');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirm) {
      return setError('Passwords do not match');
    }

    setLoading(true);
    try {
      const result = await signup({
        role,
        business_name: businessName,
        email,
        phone,
        password,
      });
      setSuccess(result.message);
      setBusinessName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">C</div>
          <span className="auth-logo-text">Clarity B2B</span>
        </div>

        <p className="auth-title">Create an account</p>
        <p className="auth-subtitle">
          An admin reviews new accounts before you can log in - usually within 48 hours.
        </p>

        {error && <div className="auth-banner bad">{error}</div>}
        {success && <div className="auth-banner ok">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>I am a</label>
            <div className="auth-role-grid">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={'auth-role-card' + (role === r.value ? ' selected' : '')}
                  onClick={() => setRole(r.value)}
                >
                  <r.icon size={20} color={role === r.value ? '#3B82F6' : '#64748B'} />
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="auth-field">
            <label>Business name</label>
            <input
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Rahman Textiles Ltd"
            />
          </div>

          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div className="auth-field">
            <label>Phone (optional)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>

          <div className="auth-field">
            <label>Confirm password</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your password"
            />
          </div>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Submitting…' : 'Submit application'}
          </button>
        </form>

        <p className="auth-switch">
          Already approved? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}

export default Signup;

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, ShoppingBag, Landmark } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import './auth.css';

// Admin is deliberately not offered here. Letting anyone tick "Admin" on a
// public signup form would hand them full platform control - real admin
// accounts are seeded or promoted by an existing admin, never self-served.
const ROLES = [
  { value: 'supplier', label: 'Supplier', icon: Truck },
  { value: 'buyer', label: 'Buyer', icon: ShoppingBag },
  { value: 'funder', label: 'Funder', icon: Landmark },
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

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLogo, setSelectedLogo] = useState(null);

  const handleBusinessNameChange = async (e) => {
    const value = e.target.value;
    setBusinessName(value);
    setSelectedLogo(null);
    
    if (value.length > 2) {
      try {
        const res = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(value)}`);
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(true);
      } catch (err) {
        console.error("Failed to fetch company suggestions", err);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectCompany = (company) => {
    setBusinessName(company.name);
    setSelectedLogo(company.logo);
    setShowSuggestions(false);
  };

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

          <div className="auth-field" style={{ position: 'relative' }}>
            <label>Business name</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              {selectedLogo && (
                <img src={selectedLogo} alt="Logo" style={{ width: 24, height: 24, position: 'absolute', left: 10, borderRadius: 4 }} />
              )}
              <input
                required
                value={businessName}
                onChange={handleBusinessNameChange}
                onFocus={() => businessName.length > 2 && setShowSuggestions(true)}
                placeholder="e.g. Rahman Textiles Ltd"
                style={selectedLogo ? { paddingLeft: 42, width: '100%' } : { width: '100%' }}
              />
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #ccc', borderRadius: 4, zIndex: 10, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                {suggestions.map((company) => (
                  <div key={company.domain} onClick={() => selectCompany(company)} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #eee', color: '#334155' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    {company.logo && <img src={company.logo} alt="" style={{ width: 20, height: 20, borderRadius: 2 }} />}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{company.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{company.domain}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import './auth.css';

// Where each role lands after logging in. Buyers get their own layout
// (BuyerLayout in App.jsx); everyone else lands in the supplier shell,
// which is also where the admin panel lives.
const HOME_BY_ROLE = {
  admin: '/admin',
  supplier: '/pipeline',
  buyer: '/buyer/dynamic-discounting',
  funder: '/funder/portfolio',
};

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(email, password);
      navigate(HOME_BY_ROLE[user.role] || '/', { replace: true });
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

        <p className="auth-title">Log in</p>
        <p className="auth-subtitle">Enter your account details to reach your dashboard.</p>

        {error && <div className="auth-banner bad">{error}</div>}

        <form onSubmit={handleSubmit}>
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
            <label>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          New here? <Link to="/signup">Create an account</Link>
        </p>

        <div className="auth-demo-hint">
          <b>Demo accounts</b> (seeded by <code>npm run setup</code>):<br />
          Admin — admin@clarity.io / admin123<br />
          Supplier — supplier@clarity.io / supplier123<br />
          Buyer — buyer@clarity.io / buyer123<br />
          Funder — funder@clarity.io / funder123
        </div>
      </div>
    </div>
  );
}

export default Login;

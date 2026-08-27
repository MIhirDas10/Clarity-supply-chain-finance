// The one place that knows who is logged in. Every page reads this instead
// of calling the login API itself, so there is exactly one source of truth
// for "who am I" across the whole app.
//
// How a session survives a page refresh: the token is saved in
// localStorage, which the browser keeps even after the tab is closed. On
// every app load we send that token to GET /api/auth/me - if the server
// still accepts it, we know who is logged in without asking for a password
// again. If it has expired or the account was rejected in the meantime, we
// log the user out automatically.

import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'clarity_token';

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  // Runs once when the app first loads, and again whenever the token changes
  // (login, logout). Confirms the token still works and fetches the current
  // profile, rather than trusting whatever was saved in localStorage.
  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setUser(data))
      .catch(() => {
        // The token is no good any more - clear it so the app does not keep
        // retrying with a dead token on every page.
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function login(email, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(data.message || 'Could not reach the backend server. Make sure the API is running on port 5001.');
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function signup(payload) {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(data.message || 'Could not create the account');
    }
    return data;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Every other file calls this instead of importing AuthContext directly.
export function useAuth() {
  return useContext(AuthContext);
}

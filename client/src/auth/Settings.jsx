import React, { useState } from 'react';
import { useAuth } from './AuthContext';

export default function Settings() {
  const { user, token } = useAuth();
  
  const [businessName, setBusinessName] = useState(user?.business_name || '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ business_name: businessName, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update settings');
      }

      if (data.token) {
        localStorage.setItem('clarity_token', data.token);
      }
      
      setMessage('Settings updated successfully!');
      setPassword('');
      
      setTimeout(() => window.location.reload(), 1000);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete your profile? This cannot be undone.')) {
      return;
    }
    
    setDeleteLoading(true);
    try {
      const response = await fetch('/api/auth/settings', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer ' + token,
        },
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete profile');
      }
      
      localStorage.removeItem('clarity_token');
      window.location.href = '/login';
    } catch (err) {
      setError(err.message);
      setDeleteLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>
      
      {message && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 border border-green-200 rounded-lg">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Profile Information</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Business / User Name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f172a] focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              New Password (leave blank to keep current)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f172a] focus:border-transparent"
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto px-6 py-2.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Danger Zone</h2>
        <p className="text-red-600 mb-4 text-sm">
          Once you delete your profile, there is no going back. Please be certain.
        </p>
        <button
          onClick={handleDelete}
          disabled={deleteLoading}
          className="px-6 py-2 bg-white text-red-600 font-medium border border-red-200 rounded-lg hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-50"
        >
          {deleteLoading ? 'Deleting...' : 'Delete Profile'}
        </button>
      </div>
    </div>
  );
}

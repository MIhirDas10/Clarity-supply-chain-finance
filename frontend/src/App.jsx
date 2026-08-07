import React, { useState } from 'react';
import { LayoutDashboard, UploadCloud, FileText, TrendingUp, History, Bell, Settings, Search, Grid, Activity } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('Pipeline');

  let pageContent = null;
  if (activeTab === 'Pipeline') {
    pageContent = <Dashboard />;
  } else {
    pageContent = (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        {activeTab} module is not yet implemented.
      </div>
    );
  }

  const handleTabClick = (e, tabName) => {
    e.preventDefault();
    setActiveTab(tabName);
  };

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">C</div>
          <div className="brand-text">Clarity B2B</div>
        </div>
        <div className="sidebar-account">
          <div className="account-title">Supplier Portal</div>
          <div className="account-subtitle">Enterprise Account</div>
        </div>
        <button className="sidebar-btn-primary">
          New Discount Request
        </button>
        <nav className="sidebar-nav">
          <a href="#" onClick={(e) => handleTabClick(e, 'Dashboard')} className={`nav-item ${activeTab === 'Dashboard' ? 'active' : ''}`}><LayoutDashboard size={18} /> Dashboard</a>
          <a href="#" onClick={(e) => handleTabClick(e, 'Upload Invoice')} className={`nav-item ${activeTab === 'Upload Invoice' ? 'active' : ''}`}><UploadCloud size={18} /> Upload Invoice</a>
          <a href="#" onClick={(e) => handleTabClick(e, 'My Invoices')} className={`nav-item ${activeTab === 'My Invoices' ? 'active' : ''}`}><FileText size={18} /> My Invoices</a>
          <a href="#" onClick={(e) => handleTabClick(e, 'Pipeline')} className={`nav-item ${activeTab === 'Pipeline' ? 'active' : ''}`}><Activity size={18} /> Pipeline</a>
          <a href="#" onClick={(e) => handleTabClick(e, 'Cash Flow')} className={`nav-item ${activeTab === 'Cash Flow' ? 'active' : ''}`}><TrendingUp size={18} /> Cash Flow</a>
          <a href="#" onClick={(e) => handleTabClick(e, 'Payout History')} className={`nav-item ${activeTab === 'Payout History' ? 'active' : ''}`}><History size={18} /> Payout History</a>
          <a href="#" onClick={(e) => handleTabClick(e, 'Notifications')} className={`nav-item ${activeTab === 'Notifications' ? 'active' : ''}`}><Bell size={18} /> Notifications</a>
          <a href="#" onClick={(e) => handleTabClick(e, 'Settings')} className={`nav-item ${activeTab === 'Settings' ? 'active' : ''}`}><Settings size={18} /> Settings</a>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">SA</div>
          <div className="user-info">
            <div className="user-name">Supply Admin</div>
            <div className="user-email">admin@clarity.io</div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="top-header">
          <div className="search-bar">
            <Search size={16} color="var(--text-muted)" />
            <input type="text" placeholder="Search..." />
          </div>
          <div className="header-actions">
            <button className="icon-btn"><Bell size={18} /></button>
            <button className="icon-btn"><Grid size={18} /></button>
            <div className="avatar-small">A</div>
          </div>
        </header>

        {/* Dashboard Component */}
        <div className="page-content">
          {pageContent}
        </div>
      </main>
    </div>
  );
}

export default App;

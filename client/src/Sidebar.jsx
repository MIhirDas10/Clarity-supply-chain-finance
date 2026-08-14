import {
  LayoutDashboard,
  Upload,
  FileText,
  TrendingUp,
  Clock,
  Bell,
  Settings,
  ShieldAlert,
} from 'lucide-react';

// Same seven items, same order, same icons as Digonta's sidebar.
// "built" marks the pages that actually exist in this app.
export const NAV_ITEMS = [
  { key: 'invoices', label: 'Dashboard', icon: LayoutDashboard, built: true },
  // The two features submitted for the API assignment.
  { key: 'upload', label: 'Upload Invoice', icon: Upload, built: true },
  { key: 'disputes', label: 'Dispute Centre', icon: ShieldAlert, built: true },
  { key: 'invoices', label: 'My Invoices', icon: FileText, built: true },
  { key: 'cashflow', label: 'Cash Flow', icon: TrendingUp, built: false },
  { key: 'payouts', label: 'Payout History', icon: Clock, built: true },
  { key: 'notifications', label: 'Notifications', icon: Bell, built: false },
  { key: 'settings', label: 'Settings', icon: Settings, built: false },
];

function Sidebar({ page, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-row">
          <span className="logo-box">C</span>
          <span className="logo-text">Clarity B2B</span>
        </div>
        <p className="logo-portal">Supplier Portal</p>
        <p className="logo-account">Enterprise Account</p>
      </div>

      <div className="sidebar-cta">
        <button className="cta-button">New Discount Request</button>
      </div>

      <nav className="nav">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const isActive = page === item.key;

          return (
            <button
              key={index}
              className={isActive ? 'nav-item active' : 'nav-item'}
              onClick={() => onNavigate(item.key)}
            >
              <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-user">
        <span className="user-avatar">SA</span>
        <div>
          <p className="user-name">Supply Admin</p>
          <p className="user-email">admin@clarity.io</p>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;

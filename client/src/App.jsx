import PayoutHistory from './PayoutHistory.jsx';

function App() {
  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">
          <span className="brand-dot"></span> Clarity B2B
        </span>
        <span className="supplier-name">Rahman Textiles Ltd</span>
      </header>

      <main className="content">
        <PayoutHistory />
      </main>
    </div>
  );
}

export default App;

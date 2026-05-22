import { NavLink, Outlet } from 'react-router-dom';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function Layout() {
  const now = new Date();
  const label = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-logo">
          <NavLink to="/" aria-label="SpendVentures home">
            <img src="/spendventures_logo_only.svg" alt="SpendVentures" />
          </NavLink>
        </div>
        <nav className="nav-links">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
          <NavLink to="/report">Monthly report</NavLink>
          <NavLink to="/debts">Debt tracker</NavLink>
        </nav>
        <div className="sidebar-month">
          <div className="sidebar-month-label">Calendar month</div>
          <div>{label}</div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

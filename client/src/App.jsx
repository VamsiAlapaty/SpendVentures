import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Transactions from './pages/Transactions.jsx';
import Report from './pages/Report.jsx';
import Debts from './pages/Debts.jsx';

export default function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 3200 }} />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="report" element={<Report />} />
          <Route path="debts" element={<Debts />} />
        </Route>
      </Routes>
    </>
  );
}

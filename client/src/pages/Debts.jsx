import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api.js';
import { formatMoney } from '../money.js';

export default function Debts() {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    creditor: '',
    total_amount: '',
    due_date: '',
    interest_rate: '',
  });

  async function reload() {
    setLoading(true);
    try {
      const rows = await api('/debts');
      setDebts(rows);
    } catch {
      toast.error('Unable to load debts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await api('/debts', {
        method: 'POST',
        body: JSON.stringify({
          creditor: form.creditor,
          total_amount: form.total_amount,
          due_date: form.due_date || null,
          interest_rate: form.interest_rate === '' ? null : Number(form.interest_rate),
        }),
      });
      toast.success('Debt added');
      setForm({ creditor: '', total_amount: '', due_date: '', interest_rate: '' });
      reload();
    } catch (err) {
      toast.error(err.body?.error || 'Could not add debt');
    }
  }

  return (
    <div>
      <h1 className="page-title">Debt tracker</h1>

      <section className="panel">
        <h2>Add a debt</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="creditor">Creditor</label>
              <input
                id="creditor"
                value={form.creditor}
                onChange={(e) => setForm((f) => ({ ...f, creditor: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="total_amount">Amount owed</label>
              <input
                id="total_amount"
                type="number"
                step="0.01"
                min="0.01"
                value={form.total_amount}
                onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="due_date">Due date</label>
              <input
                id="due_date"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="interest_rate">Interest rate % (optional)</label>
              <input
                id="interest_rate"
                type="number"
                step="0.01"
                min="0"
                value={form.interest_rate}
                onChange={(e) => setForm((f) => ({ ...f, interest_rate: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" type="submit">
              Save debt
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Your debts</h2>
        {loading ? (
          <p>Loading…</p>
        ) : debts.length === 0 ? (
          <p>No debts recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Creditor</th>
                  <th>Original</th>
                  <th>Remaining</th>
                  <th>Due</th>
                  <th>Rate %</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((d) => (
                  <DebtRow key={d.id} debt={d} onPaid={reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function DebtRow({ debt, onPaid }) {
  const [amount, setAmount] = useState('');
  const [payDate, setPayDate] = useState('');

  async function submitPayment(e) {
    e.preventDefault();
    try {
      await api(`/debts/${debt.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount_paid: amount,
          paid_on: payDate || undefined,
        }),
      });
      toast.success('Payment recorded');
      setAmount('');
      setPayDate('');
      onPaid();
    } catch (err) {
      toast.error(err.body?.error || 'Payment failed');
    }
  }

  const rowStyle = debt.overdue
    ? { background: 'rgba(192, 57, 43, 0.08)', boxShadow: 'inset 3px 0 0 #c0392b' }
    : undefined;

  return (
    <tr style={rowStyle}>
      <td>
        <strong>{debt.creditor}</strong>
        {debt.overdue && (
          <div style={{ fontSize: '0.78rem', color: '#c0392b', fontWeight: 600 }}>
            Overdue
          </div>
        )}
      </td>
      <td>{formatMoney(debt.total_amount)}</td>
      <td>{formatMoney(debt.remaining_balance)}</td>
      <td>{debt.due_date || '—'}</td>
      <td>{debt.interest_rate == null ? '—' : `${Number(debt.interest_rate).toFixed(2)}%`}</td>
      <td>
        <form onSubmit={submitPayment} style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Amt"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            style={{ width: '100px', border: '1px solid #d9e3f3', borderRadius: 8, padding: '0.35rem' }}
          />
          <input
            type="date"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
            style={{ border: '1px solid #d9e3f3', borderRadius: 8, padding: '0.35rem' }}
          />
          <button className="btn btn-primary btn-sm" type="submit" disabled={debt.remaining_balance <= 0}>
            Pay
          </button>
        </form>
      </td>
    </tr>
  );
}

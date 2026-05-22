const express = require('express');
const { db } = require('../database');
const { toNumber } = require('../util/money');

const router = express.Router();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/', (_req, res) => {
  const debts = db
    .prepare(
      `
      SELECT *, (due_date IS NOT NULL AND date(due_date) < date(?)) AS overdue
      FROM debts ORDER BY creditor COLLATE NOCASE
    `,
    )
    .all(todayISO());
  res.json(debts.map((d) => ({ ...d, overdue: Boolean(d.overdue) })));
});

router.post('/', (req, res) => {
  const { creditor, total_amount, due_date, interest_rate } = req.body || {};
  const name = typeof creditor === 'string' ? creditor.trim() : '';
  if (!name) return res.status(400).json({ error: 'creditor is required' });

  const total = toNumber(total_amount);
  if (!Number.isFinite(total) || total <= 0)
    return res.status(400).json({ error: 'total_amount must be a positive number' });

  const ir =
    interest_rate === undefined || interest_rate === null || interest_rate === ''
      ? null
      : toNumber(interest_rate);
  if (ir != null && !Number.isFinite(ir)) {
    return res.status(400).json({ error: 'interest_rate must be a number' });
  }

  const dd = typeof due_date === 'string' && due_date.trim() ? due_date.trim() : null;

  const info = db
    .prepare(
      `
      INSERT INTO debts (creditor, total_amount, remaining_balance, due_date, interest_rate)
      VALUES (?, ?, ?, ?, ?)
    `,
    )
    .run(name, total, total, dd, ir);

  const row = db
    .prepare('SELECT *, 0 AS overdue FROM debts WHERE id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.post('/:id/payments', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(404).json({ error: 'Not found' });

  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
  if (!debt) return res.status(404).json({ error: 'Not found' });

  const amt = toNumber(req.body?.amount_paid);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'amount_paid must be a positive number' });
  }

  const paid_on =
    typeof req.body?.paid_on === 'string' && req.body.paid_on.trim()
      ? req.body.paid_on.trim()
      : todayISO();

  const payAmount = Math.min(amt, debt.remaining_balance);

  db.transaction(() => {
    db.prepare(
      'INSERT INTO debt_payments (debt_id, amount_paid, paid_on) VALUES (?, ?, ?)',
    ).run(id, payAmount, paid_on);
    const nextBal = Math.max(0, debt.remaining_balance - payAmount);
    db.prepare('UPDATE debts SET remaining_balance = ? WHERE id = ?').run(nextBal, id);
  })();

  const updated = db
    .prepare('SELECT *, (due_date IS NOT NULL AND date(due_date) < date(?)) AS overdue FROM debts WHERE id = ?')
    .get(todayISO(), id);
  res.status(201).json({ ...updated, overdue: Boolean(updated.overdue), payment_amount: payAmount });
});

module.exports = router;

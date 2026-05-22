const express = require('express');
const { db } = require('../database');

const router = express.Router();

router.get('/', (req, res) => {
  const now = new Date();
  const month = req.query.month != null ? parseInt(req.query.month, 10) : now.getMonth() + 1;
  const year = req.query.year != null ? parseInt(req.query.year, 10) : now.getFullYear();

  if (Number.isNaN(month) || month < 1 || month > 12 || Number.isNaN(year)) {
    return res.status(400).json({ error: 'Invalid month or year' });
  }

  const m = String(month).padStart(2, '0');
  const y = String(year);

  const income =
    db
      .prepare(
        `
      SELECT COALESCE(SUM(amount), 0) AS s FROM transactions
      WHERE type = 'income' AND strftime('%Y', date) = ? AND strftime('%m', date) = ?
    `,
      )
      .get(y, m).s ?? 0;

  const expenses =
    db
      .prepare(
        `
      SELECT COALESCE(SUM(amount), 0) AS s FROM transactions
      WHERE type = 'expense' AND strftime('%Y', date) = ? AND strftime('%m', date) = ?
    `,
      )
      .get(y, m).s ?? 0;

  const debtOutstanding =
    db.prepare(`SELECT COALESCE(SUM(remaining_balance), 0) AS s FROM debts`).get().s ?? 0;

  res.json({
    month,
    year,
    income,
    expenses,
    net_balance: income - expenses,
    debt_total_outstanding: debtOutstanding,
  });
});

router.get('/charts', (req, res) => {
  const now = new Date();
  const month = req.query.month != null ? parseInt(req.query.month, 10) : now.getMonth() + 1;
  const year = req.query.year != null ? parseInt(req.query.year, 10) : now.getFullYear();

  if (Number.isNaN(month) || month < 1 || month > 12 || Number.isNaN(year)) {
    return res.status(400).json({ error: 'Invalid month or year' });
  }

  const m = String(month).padStart(2, '0');
  const y = String(year);

  const expenseByCategory = db
    .prepare(
      `
      SELECT c.name AS label, SUM(t.amount) AS total
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'expense' AND strftime('%Y', t.date) = ? AND strftime('%m', t.date) = ?
      GROUP BY c.id
      ORDER BY total DESC
    `,
    )
    .all(y, m);

  const expenseByDay = db
    .prepare(
      `
      SELECT date AS day, SUM(amount) AS total
      FROM transactions
      WHERE type = 'expense' AND strftime('%Y', date) = ? AND strftime('%m', date) = ?
      GROUP BY date
      ORDER BY date ASC
    `,
    )
    .all(y, m);

  res.json({ month, year, expense_by_category: expenseByCategory, expense_by_day: expenseByDay });
});

module.exports = router;

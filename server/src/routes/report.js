const express = require('express');
const { db } = require('../database');

const router = express.Router();

function monthBounds(month, year) {
  const m = String(month).padStart(2, '0');
  const y = String(year);
  return { m, y };
}

function prevMonth(month, year) {
  let m = month - 1;
  let yr = year;
  if (m < 1) {
    m = 12;
    yr -= 1;
  }
  return { month: m, year: yr };
}

router.get('/', (req, res) => {
  const now = new Date();
  const month = req.query.month != null ? parseInt(req.query.month, 10) : now.getMonth() + 1;
  const year = req.query.year != null ? parseInt(req.query.year, 10) : now.getFullYear();

  if (Number.isNaN(month) || month < 1 || month > 12 || Number.isNaN(year)) {
    return res.status(400).json({ error: 'Invalid month or year' });
  }

  const { m, y } = monthBounds(month, year);

  const byCategory = db
    .prepare(
      `
      SELECT c.name AS category, SUM(t.amount) AS total
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'expense' AND strftime('%Y', t.date) = ? AND strftime('%m', t.date) = ?
      GROUP BY c.id
      ORDER BY total DESC
    `,
    )
    .all(y, m);

  const byItemType = db
    .prepare(
      `
      SELECT COALESCE(NULLIF(TRIM(item_type), ''), 'Other') AS item_type, SUM(amount) AS total
      FROM transactions
      WHERE type = 'expense' AND strftime('%Y', date) = ? AND strftime('%m', date) = ?
      GROUP BY item_type
      ORDER BY total DESC
    `,
    )
    .all(y, m);

  const expenseTxRows = db
    .prepare(
      `
      SELECT t.id, t.date, t.amount, t.item_type, c.name AS category_name
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'expense' AND strftime('%Y', t.date) = ? AND strftime('%m', t.date) = ?
      ORDER BY t.date DESC, t.id DESC
    `,
    )
    .all(y, m);

  function normalizeExpenseItemType(v) {
    const t = String(v ?? '').trim();
    return t === '' ? 'Other' : t;
  }

  const groupsMap = new Map();
  for (const row of expenseTxRows) {
    const label = normalizeExpenseItemType(row.item_type);
    if (!groupsMap.has(label)) {
      groupsMap.set(label, { item_type: label, total: 0, transactions: [] });
    }
    const g = groupsMap.get(label);
    g.total += row.amount;
    g.transactions.push({
      id: row.id,
      date: row.date,
      amount: row.amount,
      category_name: row.category_name,
    });
  }

  const by_item_type_detail = Array.from(groupsMap.values()).sort((a, b) => b.total - a.total);

  const categoryGroupsMap = new Map();
  for (const row of expenseTxRows) {
    const category = row.category_name;
    const itemType = normalizeExpenseItemType(row.item_type);
    if (!categoryGroupsMap.has(category)) {
      categoryGroupsMap.set(category, {
        category,
        total: 0,
        item_types: new Map(),
      });
    }
    const categoryGroup = categoryGroupsMap.get(category);
    categoryGroup.total += row.amount;

    if (!categoryGroup.item_types.has(itemType)) {
      categoryGroup.item_types.set(itemType, {
        item_type: itemType,
        total: 0,
        transactions: [],
      });
    }
    const typeGroup = categoryGroup.item_types.get(itemType);
    typeGroup.total += row.amount;
    typeGroup.transactions.push({
      id: row.id,
      date: row.date,
      amount: row.amount,
      category_name: row.category_name,
    });
  }

  const by_category_detail = Array.from(categoryGroupsMap.values())
    .map((group) => ({
      category: group.category,
      total: group.total,
      item_types: Array.from(group.item_types.values()).sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);

  const debtAdded =
    db
      .prepare(
        `
      SELECT COALESCE(SUM(amount), 0) AS s FROM transactions
      WHERE type = 'debt' AND strftime('%Y', date) = ? AND strftime('%m', date) = ?
    `,
      )
      .get(y, m).s ?? 0;

  const debtPaid =
    db
      .prepare(
        `
      SELECT COALESCE(SUM(amount_paid), 0) AS s FROM debt_payments
      WHERE strftime('%Y', paid_on) = ? AND strftime('%m', paid_on) = ?
    `,
      )
      .get(y, m).s ?? 0;

  const expenseTotalCurr =
    db
      .prepare(
        `
      SELECT COALESCE(SUM(amount), 0) AS s FROM transactions
      WHERE type = 'expense' AND strftime('%Y', date) = ? AND strftime('%m', date) = ?
    `,
      )
      .get(y, m).s ?? 0;

  const { month: pm, year: py } = prevMonth(month, year);
  const mp = String(pm).padStart(2, '0');

  const expenseTotalPrev =
    db
      .prepare(
        `
      SELECT COALESCE(SUM(amount), 0) AS s FROM transactions
      WHERE type = 'expense' AND strftime('%Y', date) = ? AND strftime('%m', date) = ?
    `,
      )
      .get(String(py), mp).s ?? 0;

  const delta = expenseTotalCurr - expenseTotalPrev;
  const pct =
    expenseTotalPrev === 0 ? null : ((expenseTotalCurr - expenseTotalPrev) / expenseTotalPrev) * 100;

  res.json({
    month,
    year,
    by_category: byCategory,
    by_item_type: byItemType,
    by_item_type_detail,
    by_category_detail,
    debt_added: debtAdded,
    debt_paid: debtPaid,
    month_comparison: {
      current_spend: expenseTotalCurr,
      previous_spend: expenseTotalPrev,
      delta_spend: delta,
      percent_change_vs_previous: pct,
    },
  });
});

module.exports = router;

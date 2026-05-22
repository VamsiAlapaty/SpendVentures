const express = require('express');
const { db } = require('../database');
const { toNumber } = require('../util/money');

const router = express.Router();

/**
 * @param {string} trxType
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function resolveItemType(trxType, raw) {
  if (trxType !== 'expense') {
    return { ok: true, value: 'Other' };
  }
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) {
    return { ok: false, error: 'Item type is required' };
  }
  const row = db.prepare('SELECT name FROM item_types WHERE LOWER(name) = LOWER(?)').get(s);
  if (!row) {
    return { ok: false, error: 'Choose a valid item type' };
  }
  return { ok: true, value: row.name };
}

function monthYearClause(month, year) {
  const m = String(month).padStart(2, '0');
  const y = String(year);
  return {
    clause: "(strftime('%Y', t.date) = ? AND strftime('%m', t.date) = ?)",
    params: [y, m],
  };
}

router.get('/', (req, res) => {
  const { month, year, type, category } = req.query;

  let sql = `
    SELECT t.*, c.name AS category_name
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE 1=1
  `;
  const params = [];

  if (month && year) {
    const { clause, params: mp } = monthYearClause(month, year);
    sql += ` AND ${clause}`;
    params.push(...mp);
  }

  if (type && ['income', 'expense', 'debt'].includes(type)) {
    sql += ` AND t.type = ?`;
    params.push(type);
  }

  if (category) {
    const catId = parseInt(category, 10);
    if (!Number.isNaN(catId)) {
      sql += ` AND t.category_id = ?`;
      params.push(catId);
    }
  }

  sql += ` ORDER BY t.date DESC, t.id DESC`;

  const rows = db.prepare(sql).all(...params);
  const ids = rows.map((r) => r.id);
  let customMap = {};

  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const cvRows = db
      .prepare(
        `
        SELECT tcv.transaction_id, tcv.custom_field_id, tcv.value, cf.field_name
        FROM transaction_custom_values tcv
        JOIN custom_fields cf ON cf.id = tcv.custom_field_id
        WHERE tcv.transaction_id IN (${placeholders})
      `,
      )
      .all(...ids);

    customMap = cvRows.reduce((acc, row) => {
      if (!acc[row.transaction_id]) acc[row.transaction_id] = [];
      acc[row.transaction_id].push({
        custom_field_id: row.custom_field_id,
        field_name: row.field_name,
        value: row.value,
      });
      return acc;
    }, {});
  }

  res.json(
    rows.map((r) => ({
      ...r,
      payee: r.payee || '',
      custom_values: customMap[r.id] || [],
    })),
  );
});

router.post('/', (req, res) => {
  const { date, amount, type, category_id, item_type, custom_values } = req.body || {};

  const amt = toNumber(amount);
  const errs = {};
  if (!Number.isFinite(amt)) errs.amount = 'Amount is required and must be a number';
  if (!type || !['income', 'expense', 'debt'].includes(type)) errs.type = 'Valid type is required';

  const catId = parseInt(category_id, 10);
  if (Number.isNaN(catId) || catId <= 0) errs.category_id = 'Category is required';

  const d = typeof date === 'string' ? date.trim() : '';
  if (!d) errs.date = 'Date is required';

  if (Object.keys(errs).length) {
    return res.status(400).json({ errors: errs });
  }

  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(catId);
  if (!cat) return res.status(400).json({ errors: { category_id: 'Invalid category' } });

  const resolved = resolveItemType(type, item_type);
  if (!resolved.ok) {
    return res.status(400).json({ errors: { item_type: resolved.error } });
  }
  const it = resolved.value;

  try {
    const info = db
      .prepare(
        `
        INSERT INTO transactions (date, amount, type, category_id, payee, notes, item_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(d, amt, type, catId, '', '', it);

    const id = info.lastInsertRowid;
    upsertCustomValues(id, custom_values);

    const row = db
      .prepare(
        `
        SELECT t.*, c.name AS category_name
        FROM transactions t JOIN categories c ON c.id = t.category_id
        WHERE t.id = ?
      `,
      )
      .get(id);
    const customs = fetchCustomValuesForTransaction(id);
    res.status(201).json({ ...row, custom_values: customs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function upsertCustomValues(transactionId, custom_values) {
  if (!custom_values || typeof custom_values !== 'object') return;
  const del = db.prepare('DELETE FROM transaction_custom_values WHERE transaction_id = ?');
  del.run(transactionId);

  const ins = db.prepare(
    `
    INSERT INTO transaction_custom_values (transaction_id, custom_field_id, value)
    VALUES (?, ?, ?)
  `,
  );

  for (const [key, raw] of Object.entries(custom_values)) {
    const fieldId = parseInt(key, 10);
    if (Number.isNaN(fieldId)) continue;
    const field = db.prepare('SELECT id, field_type FROM custom_fields WHERE id = ?').get(fieldId);
    if (!field) continue;

    let value = raw == null ? '' : String(raw);
    if (field.field_type === 'number') {
      const n = toNumber(value);
      value = Number.isFinite(n) ? String(n) : '';
    }
    ins.run(transactionId, fieldId, value);
  }
}

function fetchCustomValuesForTransaction(id) {
  return db
    .prepare(
      `
      SELECT tcv.custom_field_id, tcv.value, cf.field_name
      FROM transaction_custom_values tcv
      JOIN custom_fields cf ON cf.id = tcv.custom_field_id
      WHERE tcv.transaction_id = ?
    `,
    )
    .all(id);
}

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(404).json({ error: 'Not found' });

  const existing = db.prepare('SELECT id FROM transactions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { date, amount, type, category_id, item_type, custom_values } = req.body || {};

  const amt = toNumber(amount);
  const errs = {};
  if (!Number.isFinite(amt)) errs.amount = 'Amount is required and must be a number';
  if (!type || !['income', 'expense', 'debt'].includes(type)) errs.type = 'Valid type is required';

  const catId = parseInt(category_id, 10);
  if (Number.isNaN(catId)) errs.category_id = 'Category is required';

  const d = typeof date === 'string' ? date.trim() : '';
  if (!d) errs.date = 'Date is required';

  if (Object.keys(errs).length) return res.status(400).json({ errors: errs });

  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(catId);
  if (!cat) return res.status(400).json({ errors: { category_id: 'Invalid category' } });

  const resolved = resolveItemType(type, item_type);
  if (!resolved.ok) {
    return res.status(400).json({ errors: { item_type: resolved.error } });
  }
  const it = resolved.value;

  db.transaction(() => {
    db.prepare(
      `
      UPDATE transactions
      SET date = ?, amount = ?, type = ?, category_id = ?, payee = ?, notes = ?, item_type = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
    ).run(d, amt, type, catId, '', '', it, id);

    upsertCustomValues(id, custom_values);
  })();

  const row = db
    .prepare(
      `
      SELECT t.*, c.name AS category_name
      FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.id = ?
    `,
    )
    .get(id);
  const customs = fetchCustomValuesForTransaction(id);
  res.json({ ...row, custom_values: customs });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(404).json({ error: 'Not found' });

  const info = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = router;

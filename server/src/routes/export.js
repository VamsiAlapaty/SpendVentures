const express = require('express');
const { db } = require('../database');

const router = express.Router();

function csvEscape(cell) {
  const s = cell == null ? '' : String(cell);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get('/', (req, res) => {
  const now = new Date();
  const month = req.query.month != null ? parseInt(req.query.month, 10) : now.getMonth() + 1;
  const year = req.query.year != null ? parseInt(req.query.year, 10) : now.getFullYear();

  if (Number.isNaN(month) || month < 1 || month > 12 || Number.isNaN(year)) {
    return res.status(400).json({ error: 'Invalid month or year' });
  }

  const m = String(month).padStart(2, '0');
  const y = String(year);

  const rows = db
    .prepare(
      `
      SELECT t.id, t.date, t.amount, t.type, c.name AS category, t.item_type
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE strftime('%Y', t.date) = ? AND strftime('%m', t.date) = ?
      ORDER BY t.date ASC, t.id ASC
    `,
    )
    .all(y, m);

  const fields = db.prepare('SELECT id, field_name FROM custom_fields ORDER BY id').all();
  const cfIds = fields.map((f) => f.id);

  let customVals = {};
  if (rows.length && cfIds.length) {
    const ids = rows.map((r) => r.id);
    const ph = ids.map(() => '?').join(',');
    const cvs = db
      .prepare(
        `
        SELECT transaction_id, custom_field_id, value
        FROM transaction_custom_values
        WHERE transaction_id IN (${ph})
      `,
      )
      .all(...ids);
    customVals = cvs.reduce((acc, cv) => {
      if (!acc[cv.transaction_id]) acc[cv.transaction_id] = {};
      acc[cv.transaction_id][cv.custom_field_id] = cv.value;
      return acc;
    }, {});
  }

  const header = [
    'id',
    'date',
    'amount',
    'type',
    'category',
    'item_type',
    ...fields.map((f) => `custom:${f.field_name}`),
  ];

  const lines = [header.join(',')];

  for (const r of rows) {
    const cv = customVals[r.id] || {};
    const line = [
      r.id,
      r.date,
      r.amount,
      r.type,
      r.category,
      r.item_type,
      ...cfIds.map((fid) => cv[fid] ?? ''),
    ].map(csvEscape);
    lines.push(line.join(','));
  }

  const body = lines.join('\r\n');
  const filename = `spendventures-${y}-${m}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
});

module.exports = router;

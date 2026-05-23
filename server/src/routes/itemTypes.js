const express = require('express');
const { db } = require('../database');

const router = express.Router();

router.get('/', (_req, res) => {
  const categoryId = typeof _req.query?.category_id !== 'undefined' ? parseInt(_req.query.category_id, 10) : null;
  const includeGlobal = String(_req.query?.include_global ?? '1');
  let rows;
  if (categoryId && Number.isFinite(categoryId)) {
    if (includeGlobal === '0' || includeGlobal.toLowerCase() === 'false') {
      rows = db
        .prepare(
          `SELECT * FROM item_types WHERE category_id = ? ORDER BY is_custom ASC, name COLLATE NOCASE`,
        )
        .all(categoryId);
    } else {
      rows = db
        .prepare(
          `SELECT * FROM item_types WHERE category_id IS NULL OR category_id = ? ORDER BY is_custom ASC, name COLLATE NOCASE`,
        )
        .all(categoryId);
    }
  } else {
    rows = db.prepare('SELECT * FROM item_types ORDER BY is_custom ASC, name COLLATE NOCASE').all();
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const categoryId = typeof req.body?.category_id !== 'undefined' && req.body.category_id !== ''
    ? parseInt(req.body.category_id, 10)
    : null;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    if (categoryId && !Number.isFinite(categoryId)) return res.status(400).json({ error: 'Invalid category' });
    if (categoryId) {
      const exists = db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId);
      if (!exists) return res.status(400).json({ error: 'Category not found' });
    }
    const info = db
      .prepare('INSERT INTO item_types (name, is_custom, category_id) VALUES (?, 1, ?)')
      .run(name, categoryId);
    const row = db.prepare('SELECT * FROM item_types WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Item type already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(404).json({ error: 'Not found' });

  const row = db.prepare('SELECT * FROM item_types WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  if (!row.is_custom) {
    return res.status(400).json({ error: 'Built-in item types cannot be deleted' });
  }

  const used = db
    .prepare(
      `
      SELECT COUNT(*) AS c FROM transactions
      WHERE LOWER(TRIM(item_type)) = LOWER(TRIM(?))
    `,
    )
    .get(row.name).c;
  if (used > 0) {
    return res.status(409).json({
      error: 'This item type is used by existing transactions and cannot be removed',
    });
  }

  try {
    db.prepare('DELETE FROM item_types WHERE id = ?').run(id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

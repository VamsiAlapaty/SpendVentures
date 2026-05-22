const express = require('express');
const { db } = require('../database');

const router = express.Router();

router.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM item_types ORDER BY is_custom ASC, name COLLATE NOCASE')
    .all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const info = db.prepare('INSERT INTO item_types (name, is_custom) VALUES (?, 1)').run(name);
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

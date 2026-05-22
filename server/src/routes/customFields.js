const express = require('express');
const { db } = require('../database');

const router = express.Router();

router.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT id, field_name, field_type FROM custom_fields ORDER BY field_name COLLATE NOCASE')
    .all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const field_name =
    typeof req.body?.field_name === 'string' ? req.body.field_name.trim() : '';
  const field_type = req.body?.field_type;

  if (!field_name) return res.status(400).json({ error: 'field_name is required' });
  if (!['text', 'number', 'date'].includes(field_type)) {
    return res.status(400).json({ error: 'field_type must be text, number, or date' });
  }

  try {
    const info = db
      .prepare('INSERT INTO custom_fields (field_name, field_type) VALUES (?, ?)')
      .run(field_name, field_type);
    const row = db
      .prepare('SELECT id, field_name, field_type FROM custom_fields WHERE id = ?')
      .get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Field name already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

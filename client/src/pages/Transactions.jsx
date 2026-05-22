import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api.js';
import { formatMoney } from '../money.js';

/** Shown if GET /api/item-types fails (e.g. stale API process without that route). */
const FALLBACK_ITEM_TYPES = [
  { id: -1, name: 'Walmart', is_custom: 0 },
  { id: -2, name: 'Costco', is_custom: 0 },
  { id: -3, name: 'Apna Bazar', is_custom: 0 },
  { id: -4, name: 'Rent', is_custom: 0 },
  { id: -5, name: 'Other', is_custom: 0 },
];

function emptyForm(seedDate) {
  const today = seedDate || new Date().toISOString().slice(0, 10);
  return {
    date: today,
    amount: '',
    type: '',
    category_id: '',
    item_type: 'Other',
    custom: {},
  };
}

function customFromRow(row) {
  const custom = {};
  for (const v of row.custom_values || []) {
    custom[v.custom_field_id] = v.value ?? '';
  }
  return custom;
}

export default function Transactions() {
  const [categories, setCategories] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({
    month: '',
    year: '',
    type: '',
    category: '',
  });

  const [filterCategoryName, setFilterCategoryName] = useState('');

  const [newCategory, setNewCategory] = useState('');
  const [newItemType, setNewItemType] = useState('');
  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');

  const [form, setForm] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});

  const [editRow, setEditRow] = useState(null);

  const qs = useMemo(() => buildQuery(filters), [filters]);

  const loadMeta = useCallback(async () => {
    const results = await Promise.allSettled([
      api('/categories'),
      api('/item-types'),
      api('/custom-fields'),
    ]);

    if (results[0].status === 'fulfilled') {
      setCategories(results[0].value);
    } else {
      console.error(results[0].reason);
      toast.error(
        'Could not load categories. Start the API on port 3001 (npm run dev from the project root).',
      );
    }

    if (results[1].status === 'fulfilled') {
      setItemTypes(results[1].value);
    } else {
      console.error(results[1].reason);
      toast.error(
        'Could not load item types — restart the SpendVentures API so it includes the latest routes, then refresh.',
        { duration: 6000 },
      );
      setItemTypes(FALLBACK_ITEM_TYPES);
    }

    if (results[2].status === 'fulfilled') {
      setCustomFields(results[2].value);
    } else {
      console.error(results[2].reason);
      toast.error('Could not load custom fields.');
    }
  }, []);

  const loadRows = useCallback(async () => {
    const txs = await api(`/transactions${qs}`);
    setRows(txs);
  }, [qs]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // Keep filterCategoryName and filters.category (which stores id) in sync
  useEffect(() => {
    if (!filterCategoryName) {
      setFilters((f) => ({ ...f, category: '' }));
      return;
    }
    const match = categories.find((c) => c.name === filterCategoryName);
    setFilters((f) => ({ ...f, category: match ? String(match.id) : '' }));
  }, [filterCategoryName, categories]);

  // When categories load or filters.category changes elsewhere, update the name input
  useEffect(() => {
    if (!filters.category) {
      setFilterCategoryName('');
      return;
    }
    const match = categories.find((c) => String(c.id) === String(filters.category));
    setFilterCategoryName(match ? match.name : '');
  }, [filters.category, categories]);

  useEffect(() => {
    loadRows().catch(() => toast.error('Could not load transactions'));
  }, [loadRows]);

  useEffect(() => {
    if (form.type !== 'expense' || itemTypes.length === 0) return;
    setForm((f) => {
      if (f.type !== 'expense') return f;
      if (itemTypes.some((t) => t.name === f.item_type)) return f;
      return {
        ...f,
        item_type: itemTypes.find((t) => t.name === 'Other')?.name ?? itemTypes[0].name,
      };
    });
  }, [form.type, itemTypes]);

  async function addCategory(e) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    try {
      const row = await api('/categories', { method: 'POST', body: JSON.stringify({ name }) });
      setCategories((prev) =>
        [...prev, row].sort(
          (a, b) => a.is_custom - b.is_custom || a.name.localeCompare(b.name),
        ),
      );
      toast.success('Category added');
      setNewCategory('');
    } catch (err) {
      const hint =
        err.status === 404
          ? ' API not found — restart the backend (stop Node on port 3001, then npm run dev).'
          : '';
      toast.error((err.body?.error || err.message || 'Could not add category') + hint);
    }
  }

  async function addItemType(e) {
    e.preventDefault();
    const name = newItemType.trim();
    if (!name) return;
    try {
      const row = await api('/item-types', { method: 'POST', body: JSON.stringify({ name }) });
      setItemTypes((prev) =>
        [...prev, row].sort(
          (a, b) => a.is_custom - b.is_custom || a.name.localeCompare(b.name),
        ),
      );
      toast.success('Item type added');
      setNewItemType('');
    } catch (err) {
      const hint =
        err.status === 404
          ? ' Restart the API (stop old Node on port 3001, run npm run dev from the project root).'
          : '';
      toast.error(
        (err.body?.error || err.message || 'Could not add item type') + hint,
      );
    }
  }

  async function removeItemType(t) {
    if (
      !confirm(
        `Remove item type "${t.name}"? Only allowed if no transactions use it.`,
      )
    ) {
      return;
    }
    try {
      await api(`/item-types/${t.id}`, { method: 'DELETE' });
      setItemTypes((prev) => prev.filter((x) => x.id !== t.id));
      setForm((f) =>
        f.item_type === t.name ? { ...f, item_type: 'Other' } : f,
      );
      toast.success('Item type removed');
      loadRows();
    } catch (err) {
      toast.error(err.body?.error || 'Could not remove item type');
    }
  }

  async function removeCategory(c) {
    if (
      !confirm(
        `Remove custom category "${c.name}"? This is only possible if no transactions use it.`,
      )
    ) {
      return;
    }
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      setCategories((prev) => prev.filter((x) => x.id !== c.id));
      setForm((f) => (String(f.category_id) === String(c.id) ? { ...f, category_id: '' } : f));
      toast.success('Category removed');
      loadRows();
    } catch (err) {
      toast.error(err.body?.error || 'Could not remove category');
    }
  }

  async function addCustomField(e) {
    e.preventDefault();
    try {
      const row = await api('/custom-fields', {
        method: 'POST',
        body: JSON.stringify({ field_name: newFieldName.trim(), field_type: newFieldType }),
      });
      setCustomFields((prev) =>
        [...prev, row].sort((a, b) => a.field_name.localeCompare(b.field_name)),
      );
      toast.success('Custom field added');
      setNewFieldName('');
      setNewFieldType('text');
      setFieldModalOpen(false);
    } catch (err) {
      toast.error(err.body?.error || 'Could not add field');
    }
  }

  function buildCustomMap() {
    const map = {};
    for (const f of customFields) {
      const v = form.custom[f.id];
      if (v !== undefined && v !== '') map[f.id] = v;
    }
    return map;
  }

  async function submitTransaction(e) {
    e.preventDefault();
    const body = {
      date: form.date,
      amount: form.amount,
      type: form.type,
      category_id: form.category_id,
      item_type: form.type === 'expense' ? form.item_type : 'Other',
      custom_values: buildCustomMap(),
    };

    const errs = {};
    const amt = Number(String(body.amount).replace(/,/g, ''));
    if (!Number.isFinite(amt)) errs.amount = 'Amount is required';
    if (!body.type || !['income', 'expense', 'debt'].includes(body.type)) {
      errs.type = 'Type is required';
    }
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    if (!body.date) {
      toast.error('Pick a date');
      return;
    }
    if (!body.category_id) {
      toast.error('Pick a category');
      return;
    }
    if (body.type === 'expense' && !body.item_type) {
      toast.error('Pick an item type');
      return;
    }

    try {
      await api('/transactions', { method: 'POST', body: JSON.stringify(body) });
      toast.success('Transaction saved');
      setForm(emptyForm(form.date));
      setFormErrors({});
      loadRows();
    } catch (err) {
      if (err.status === 400 && err.body?.errors) setFormErrors(err.body.errors);
      toast.error(err.body?.error || 'Save failed');
    }
  }

  async function deleteRow(id) {
    if (!confirm('Delete this transaction?')) return;
    try {
      await api(`/transactions/${id}`, { method: 'DELETE' });
      toast.success('Deleted');
      loadRows();
    } catch {
      toast.error('Delete failed');
    }
  }

  const customCategories = categories.filter((c) => c.is_custom);
  const customItemTypes = itemTypes.filter((t) => t.is_custom);

  return (
    <div>
      <h1 className="page-title">Transactions</h1>

      <section className="panel">
        <h2>Add transaction</h2>
        <form onSubmit={submitTransaction}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="t-date">Date</label>
              <input
                id="t-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="t-amount">Amount ($)</label>
              <input
                id="t-amount"
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
              {formErrors.amount && <div className="field-error">{formErrors.amount}</div>}
            </div>
            <div className="field">
              <label htmlFor="t-type">Type</label>
              <select
                id="t-type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="debt">Debt</option>
              </select>
              {formErrors.type && <div className="field-error">{formErrors.type}</div>}
            </div>
            <div className="field">
              <label htmlFor="t-cat">Category</label>
              <select
                id="t-cat"
                value={form.category_id}
                onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {form.type === 'expense' && (
              <div className="field">
                <label htmlFor="t-it">Item type</label>
                <select
                  id="t-it"
                  value={form.item_type}
                  onChange={(e) => setForm((f) => ({ ...f, item_type: e.target.value }))}
                >
                  {itemTypes.map((it) => (
                    <option key={it.id} value={it.name}>
                      {it.name}
                    </option>
                  ))}
                </select>
                {formErrors.item_type && <div className="field-error">{formErrors.item_type}</div>}
              </div>
            )}

            {customFields.map((f) => (
              <div key={f.id} className="field">
                <label htmlFor={`cf-${f.id}`}>{f.field_name}</label>
                {f.field_type === 'text' && (
                  <input
                    id={`cf-${f.id}`}
                    value={form.custom[f.id] ?? ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        custom: { ...prev.custom, [f.id]: e.target.value },
                      }))
                    }
                  />
                )}
                {f.field_type === 'number' && (
                  <input
                    id={`cf-${f.id}`}
                    type="number"
                    step="any"
                    value={form.custom[f.id] ?? ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        custom: { ...prev.custom, [f.id]: e.target.value },
                      }))
                    }
                  />
                )}
                {f.field_type === 'date' && (
                  <input
                    id={`cf-${f.id}`}
                    type="date"
                    value={form.custom[f.id] ?? ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        custom: { ...prev.custom, [f.id]: e.target.value },
                      }))
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="submit">
              Save transaction
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setFieldModalOpen(true)}
            >
              Add custom field…
            </button>
          </div>
        </form>

        <form onSubmit={addCategory} style={{ marginTop: '1.25rem' }}>
          <h3 style={{ fontSize: '0.98rem', margin: '0 0 0.5rem' }}>Categories</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="New category name"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              style={{ flex: '1 1 200px', border: '1px solid #d9e3f3', borderRadius: 8, padding: '0.55rem' }}
            />
            <button className="btn btn-ghost" type="submit">
              Add category
            </button>
          </div>
          {customCategories.length > 0 && (
            <div className="category-manage" aria-label="Custom categories">
              {customCategories.map((c) => (
                <span key={c.id} className="category-pill">
                  <span>{c.name}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '0.15rem 0.35rem', minWidth: 0 }}
                    onClick={() => removeCategory(c)}
                    aria-label={`Remove ${c.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </form>

        <form onSubmit={addItemType} style={{ marginTop: '1.25rem' }}>
          <h3 style={{ fontSize: '0.98rem', margin: '0 0 0.5rem' }}>Item types</h3>
          <p style={{ margin: '0 0 0.65rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            Used to classify expenses. Add your own labels alongside the defaults.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="New item type name"
              value={newItemType}
              onChange={(e) => setNewItemType(e.target.value)}
              style={{ flex: '1 1 200px', border: '1px solid #d9e3f3', borderRadius: 8, padding: '0.55rem' }}
            />
            <button className="btn btn-ghost" type="submit">
              Add item type
            </button>
          </div>
          {customItemTypes.length > 0 && (
            <div className="category-manage" aria-label="Custom item types">
              {customItemTypes.map((t) => (
                <span key={t.id} className="category-pill">
                  <span>{t.name}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '0.15rem 0.35rem', minWidth: 0 }}
                    onClick={() => removeItemType(t)}
                    aria-label={`Remove ${t.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </form>
      </section>

      <section className="panel">
        <h2>Filter</h2>
        <div className="filters">
          <label>
            Month
            <select
              value={filters.month}
              onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}
            >
              <option value="">All</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {new Date(2000, i, 1).toLocaleString(undefined, { month: 'short' })}
                </option>
              ))}
            </select>
          </label>
          <label>
            Year
            <input
              type="number"
              placeholder="YYYY"
              value={filters.year}
              onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}
            />
          </label>
          <label>
            Type
            <select
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="">All</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="debt">Debt</option>
            </select>
          </label>
          <label>
            Category
            <input
              list="filter-category-list"
              value={filterCategoryName}
              onChange={(e) => setFilterCategoryName(e.target.value)}
              placeholder="All"
            />
            <datalist id="filter-category-list">
              <option value="" />
              {categories.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setFilters({ month: '', year: '', type: '', category: '' });
              setFilterCategoryName('');
            }}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Ledger</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>
                    <span className={`badge badge-${r.type}`}>{r.type}</span>
                  </td>
                  <td>{r.category_name}</td>
                  <td>{formatMoney(r.amount)}</td>
                  <td className="row-actions">
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditRow(r)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" type="button" onClick={() => deleteRow(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {fieldModalOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cf-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFieldModalOpen(false);
          }}
        >
          <div className="modal">
            <h3 id="cf-title">Create custom field</h3>
            <form onSubmit={addCustomField}>
              <div className="field">
                <label htmlFor="cf-name">Label</label>
                <input
                  id="cf-name"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  required
                />
              </div>
              <div className="field" style={{ marginTop: '0.85rem' }}>
                <label htmlFor="cf-type">Type</label>
                <select id="cf-type" value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setFieldModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editRow && (
        <EditModal
          row={editRow}
          categories={categories}
          itemTypes={itemTypes}
          customFields={customFields}
          onClose={() => setEditRow(null)}
          onSaved={() => {
            setEditRow(null);
            loadRows();
            toast.success('Updated');
          }}
        />
      )}
    </div>
  );
}

function buildQuery(f) {
  const p = new URLSearchParams();
  if (f.month && f.year) {
    p.set('month', f.month);
    p.set('year', f.year);
  }
  if (f.type) p.set('type', f.type);
  if (f.category) p.set('category', f.category);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function EditModal({ row, categories, itemTypes, customFields, onClose, onSaved }) {
  const [values, setValues] = useState(() => ({
    date: row.date,
    amount: String(row.amount),
    type: row.type,
    category_id: String(row.category_id),
    item_type: row.item_type || 'Other',
    custom: customFromRow(row),
    errors: {},
  }));

  useEffect(() => {
    setValues({
      date: row.date,
      amount: String(row.amount),
      type: row.type,
      category_id: String(row.category_id),
      item_type: row.item_type || 'Other',
      custom: customFromRow(row),
      errors: {},
    });
  }, [row]);

  useEffect(() => {
    if (values.type !== 'expense' || itemTypes.length === 0) return;
    setValues((v) => {
      if (v.type !== 'expense') return v;
      if (itemTypes.some((t) => t.name === v.item_type)) return v;
      return {
        ...v,
        item_type: itemTypes.find((t) => t.name === 'Other')?.name ?? itemTypes[0].name,
      };
    });
  }, [values.type, itemTypes]);

  async function save(e) {
    e.preventDefault();
    const custom_values = {};
    for (const f of customFields) {
      custom_values[f.id] = (values.custom && values.custom[f.id]) ?? '';
    }
    const body = {
      date: values.date,
      amount: values.amount,
      type: values.type,
      category_id: values.category_id,
      item_type: values.type === 'expense' ? values.item_type : 'Other',
      custom_values,
    };
    const errs = {};
    const amt = Number(String(body.amount).replace(/,/g, ''));
    if (!Number.isFinite(amt)) errs.amount = 'Amount is required';
    if (!body.type || !['income', 'expense', 'debt'].includes(body.type)) errs.type = 'Type is required';
    if (body.type === 'expense' && !values.item_type) errs.item_type = 'Item type is required';
    setValues((v) => ({ ...v, errors: errs }));
    if (Object.keys(errs).length) return;
    try {
      await api(`/transactions/${row.id}`, { method: 'PUT', body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      if (err.status === 400 && err.body?.errors) setValues((v) => ({ ...v, errors: err.body.errors }));
      toast.error(err.body?.error || 'Could not save');
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <h3 id="edit-title">Edit transaction</h3>
        <form onSubmit={save}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="e-date">Date</label>
              <input
                id="e-date"
                type="date"
                value={values.date}
                onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="e-amt">Amount ($)</label>
              <input
                id="e-amt"
                type="number"
                step="0.01"
                value={values.amount}
                onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
              />
              {values.errors.amount && <div className="field-error">{values.errors.amount}</div>}
            </div>
            <div className="field">
              <label htmlFor="e-type">Type</label>
              <select
                id="e-type"
                value={values.type}
                onChange={(e) => setValues((v) => ({ ...v, type: e.target.value }))}
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="debt">Debt</option>
              </select>
              {values.errors.type && <div className="field-error">{values.errors.type}</div>}
            </div>
            <div className="field">
              <label htmlFor="e-cat">Category</label>
              <select
                id="e-cat"
                value={values.category_id}
                onChange={(e) => setValues((v) => ({ ...v, category_id: e.target.value }))}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {values.type === 'expense' && (
              <div className="field">
                <label htmlFor="e-it">Item type</label>
                <select
                  id="e-it"
                  value={values.item_type}
                  onChange={(e) => setValues((v) => ({ ...v, item_type: e.target.value }))}
                >
                  {itemTypes.map((it) => (
                    <option key={it.id} value={it.name}>
                      {it.name}
                    </option>
                  ))}
                </select>
                {values.errors.item_type && (
                  <div className="field-error">{values.errors.item_type}</div>
                )}
              </div>
            )}
            {customFields.map((f) => (
              <div key={f.id} className="field">
                <label>{f.field_name}</label>
                {f.field_type === 'text' && (
                  <input
                    value={(values.custom && values.custom[f.id]) ?? ''}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        custom: { ...(v.custom || {}), [f.id]: e.target.value },
                      }))
                    }
                  />
                )}
                {f.field_type === 'number' && (
                  <input
                    type="number"
                    step="any"
                    value={(values.custom && values.custom[f.id]) ?? ''}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        custom: { ...(v.custom || {}), [f.id]: e.target.value },
                      }))
                    }
                  />
                )}
                {f.field_type === 'date' && (
                  <input
                    type="date"
                    value={(values.custom && values.custom[f.id]) ?? ''}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        custom: { ...(v.custom || {}), [f.id]: e.target.value },
                      }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

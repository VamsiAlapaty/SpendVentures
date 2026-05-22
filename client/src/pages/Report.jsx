import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { api, downloadCsvUrl } from '../api.js';
import { formatMoney } from '../money.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function Report() {
  const now = useMemo(() => new Date(), []);
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();

  const [params, setParams] = useSearchParams();
  const month = parseInt(params.get('month') || String(defaultMonth), 10) || defaultMonth;
  const year = parseInt(params.get('year') || String(defaultYear), 10) || defaultYear;

  const rawM = params.get('month');
  const rawY = params.get('year');

  useEffect(() => {
    if (!rawM || !rawY) {
      setParams(
        { month: String(defaultMonth), year: String(defaultYear) },
        { replace: true },
      );
    }
  }, [rawM, rawY, defaultMonth, defaultYear, setParams]);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api(`/report?month=${month}&year=${year}`)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, year]);

  function syncMonth(nextMonth, nextYear) {
    setParams({ month: String(nextMonth), year: String(nextYear) });
  }

  const palette = ['#3D8BCD', '#1B3A6B', '#2E9AA8', '#5C6B8A', '#92A8D8', '#4A82B6', '#7896C9'];

  const donut =
    report && report.by_category?.length > 0
      ? {
          labels: report.by_category.map((r) => r.category),
          datasets: [
            {
              data: report.by_category.map((r) => r.total),
              backgroundColor: report.by_category.map((_, i) => palette[i % palette.length]),
              borderWidth: 0,
            },
          ],
        }
      : {
          labels: ['No expense data'],
          datasets: [{ data: [1], backgroundColor: ['#d9e3f3'], borderWidth: 0 }],
        };

  const prev = report?.month_comparison;
  const pct = prev?.percent_change_vs_previous;
  const pctLabel =
    pct == null ? 'No prior month baseline' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs previous`;

  const exportHref = downloadCsvUrl(month, year);

  return (
    <div>
      <h1 className="page-title">Monthly report</h1>

      <section className="panel">
        <h2>Select month</h2>
        <div className="filters">
          <label>
            Month
            <select
              value={month}
              onChange={(e) => syncMonth(parseInt(e.target.value, 10), year)}
            >
              {MONTH_LABELS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Year
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => syncMonth(month, parseInt(e.target.value, 10))}
            />
          </label>
          <a className="btn btn-primary" href={exportHref} download>
            Export CSV
          </a>
        </div>
        <p style={{ margin: '0', color: 'var(--color-muted)', fontSize: '0.9rem' }}>
          Share this period:{' '}
          <code>{`/report?month=${month}&year=${year}`}</code>
        </p>
      </section>

      {loading ? (
        <p>Loading report…</p>
      ) : !report ? (
        <p>Could not load report.</p>
      ) : (
        <>
          <section className="panel">
            <h2>Month-over-month comparison</h2>
            <div className="card-grid">
              <div className="card">
                <div className="card-label">This month spend</div>
                <div className="card-value">{formatMoney(prev?.current_spend ?? 0)}</div>
              </div>
              <div className="card">
                <div className="card-label">Previous month spend</div>
                <div className="card-value">{formatMoney(prev?.previous_spend ?? 0)}</div>
              </div>
              <div className="card">
                <div className="card-label">Difference</div>
                <div className="card-value">{formatMoney(prev?.delta_spend ?? 0)}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-muted)', marginTop: '0.25rem' }}>
                  {pctLabel}
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Debt activity</h2>
            <div className="card-grid">
              <div className="card">
                <div className="card-label">Debt added (transactions)</div>
                <div className="card-value">{formatMoney(report.debt_added)}</div>
              </div>
              <div className="card">
                <div className="card-label">Debt paid (payments recorded)</div>
                <div className="card-value">{formatMoney(report.debt_paid)}</div>
              </div>
            </div>
          </section>

          <div className="chart-row">
            <section className="panel">
              <h2>Spending by category</h2>
              <div className="chart-wrap" style={{ maxWidth: 360, margin: '0 auto' }}>
                <Doughnut
                  data={donut}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '58%',
                    plugins: {
                      legend: { position: 'bottom', labels: { boxWidth: 12 } },
                    },
                  }}
                />
              </div>
              <div className="table-wrap" style={{ marginTop: '1rem' }}>
                {report.by_category?.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_category.map((r) => (
                        <tr key={r.category}>
                          <td>{r.category}</td>
                          <td>{formatMoney(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No category spend recorded for this month.</p>
                )}
              </div>
            </section>

            <section className="panel">
              <h2>Spending by item type</h2>
              {(report.by_category_detail ?? report.by_item_type_detail ?? report.by_item_type)?.length === 0 ? (
                <p>No item-type totals yet.</p>
              ) : report.by_category_detail?.length ? (
                <div>
                  {report.by_category_detail.map((category) => (
                    <details key={category.category} className="accordion">
                      <summary>
                        <span>{category.category}</span>
                        <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>
                          {formatMoney(category.total)}
                        </span>
                      </summary>
                      <div className="accordion-body">
                        {category.item_types.length === 0 ? (
                          <p style={{ margin: 0 }}>No item types.</p>
                        ) : (
                          <div>
                            {category.item_types.map((itemType) => (
                              <div key={itemType.item_type} className="accordion-tx">
                                <span>{itemType.item_type}</span>
                                <strong>{formatMoney(itemType.total)}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              ) : report.by_item_type_detail?.length ? (
                <div>
                  {report.by_item_type_detail.map((g) => (
                    <details key={g.item_type} className="accordion">
                      <summary>
                        <span>{g.item_type}</span>
                        <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>
                          {formatMoney(g.total)}
                        </span>
                      </summary>
                      <div className="accordion-body">
                        {g.transactions.length === 0 ? (
                          <p style={{ margin: 0 }}>No transactions.</p>
                        ) : (
                          g.transactions.map((tx) => (
                            <div key={tx.id} className="accordion-tx">
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  justifyContent: 'space-between',
                                  gap: '0.5rem',
                                }}
                              >
                                <strong>
                                  {tx.date} · {tx.category_name}
                                </strong>
                                <span style={{ fontWeight: 700 }}>{formatMoney(tx.amount)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.by_item_type.map((r) => (
                      <tr key={r.item_type}>
                        <td>{r.item_type}</td>
                        <td>{formatMoney(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

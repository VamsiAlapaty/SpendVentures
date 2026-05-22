import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { api } from '../api.js';
import { formatMoney } from '../money.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend);

ChartJS.defaults.font.family = 'Inter, system-ui, sans-serif';
ChartJS.defaults.color = '#5C6B8A';

export default function Dashboard() {
  const today = useMemo(() => new Date(), []);
  const [summary, setSummary] = useState(null);
  const [charts, setCharts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const params = `?month=${today.getMonth() + 1}&year=${today.getFullYear()}`;
    Promise.all([api(`/summary${params}`), api(`/summary/charts${params}`)])
      .then(([s, c]) => {
        if (!cancelled) {
          setSummary(s);
          setCharts(c);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [today]);

  const palette = ['#3D8BCD', '#1B3A6B', '#2E9AA8', '#5C6B8A', '#92A8D8', '#4A82B6', '#2C5282'];

  const barData =
    charts && charts.expense_by_category?.length
      ? {
          labels: charts.expense_by_category.map((r) => r.label),
          datasets: [
            {
              label: 'Expenses',
              data: charts.expense_by_category.map((r) => r.total),
              backgroundColor: charts.expense_by_category.map((_, i) => palette[i % palette.length]),
              borderRadius: 6,
            },
          ],
        }
      : {
          labels: ['No expense data'],
          datasets: [{ label: 'Expenses', data: [0], backgroundColor: ['#d9e3f3'], borderRadius: 6 }],
        };

  const lineLabels =
    charts?.expense_by_day?.length > 0
      ? charts.expense_by_day.map((r) => r.day.slice(5))
      : [String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')];

  const lineData =
    charts?.expense_by_day?.length > 0
      ? charts.expense_by_day.map((r) => r.total)
      : [0];

  const lineDataset = {
    labels: lineLabels,
    datasets: [
      {
        label: 'Daily spend',
        data: lineData,
        borderColor: '#3D8BCD',
        backgroundColor: 'rgba(61, 139, 205, 0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
      },
    ],
  };

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <div className="card-grid">
        <div className="card">
          <div className="card-label">Total income (month)</div>
          <div className="card-value">{formatMoney(summary?.income ?? 0)}</div>
        </div>
        <div className="card">
          <div className="card-label">Total expenses (month)</div>
          <div className="card-value">{formatMoney(summary?.expenses ?? 0)}</div>
        </div>
        <div className="card">
          <div className="card-label">Net balance</div>
          <div className="card-value">{formatMoney(summary?.net_balance ?? 0)}</div>
        </div>
        <div className="card">
          <div className="card-label">Outstanding debt</div>
          <div className="card-value">{formatMoney(summary?.debt_total_outstanding ?? 0)}</div>
        </div>
      </div>

      <div className="chart-row">
        <section className="panel">
          <h2>Expenses by category (this month)</h2>
          <div className="chart-wrap">
            <Bar
              data={barData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                },
                scales: {
                  x: { grid: { display: false } },
                  y: { grid: { color: '#ebeff7' }, beginAtZero: true },
                },
              }}
            />
          </div>
        </section>
        <section className="panel">
          <h2>Daily spending (this month)</h2>
          <div className="chart-wrap">
            <Line
              data={lineDataset}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                },
                scales: {
                  x: { grid: { display: false } },
                  y: { grid: { color: '#ebeff7' }, beginAtZero: true },
                },
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

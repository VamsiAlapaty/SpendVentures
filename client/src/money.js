export function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

export function padMonth(month) {
  return String(month).padStart(2, '0');
}

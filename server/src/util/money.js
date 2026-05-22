function toNumber(v) {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

module.exports = { toNumber };

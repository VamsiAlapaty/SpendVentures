async function parseJsonMaybe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
  } catch (e) {
    const msg =
      e?.message === 'Failed to fetch' || e?.name === 'TypeError'
        ? 'Cannot reach the API. Run the backend on port 3001 (e.g. npm run dev from the project root).'
        : e?.message || 'Network error';
    const err = new Error(msg);
    err.network = true;
    throw err;
  }
  if (res.status === 204) return null;
  const data = await parseJsonMaybe(res);
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function downloadCsvUrl(month, year) {
  const m = encodeURIComponent(month);
  const y = encodeURIComponent(year);
  return `/api/export?month=${m}&year=${y}`;
}

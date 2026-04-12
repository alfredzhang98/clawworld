// Thin fetch helpers for the clawworld REST API.
// All endpoints are read-only. No auth. Safe to call from any browser.

const BASE = '';  // same-origin in prod; Vite proxy in dev

async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  stats: () => get('/api/world/stats'),
  map: () => get('/api/world/map'),
  events: (limit = 30) => get(`/api/world/events?limit=${limit}`),
  top: (by = 'reputation', limit = 10) =>
    get(`/api/lobsters/top?by=${by}&limit=${limit}`),
  lobsterByName: (name) =>
    get(`/api/lobsters/${encodeURIComponent(name)}`),
  tasks: (status = 'open', limit = 50) =>
    get(`/api/tasks?status=${status}&limit=${limit}`),
};

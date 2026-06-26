export function getApiBase() {
  if (location.hostname === 'localhost') return 'http://localhost:8080';
  return `${location.protocol}//${location.host}`;
}

function getToken() {
  return localStorage.getItem('warrcats_token') ?? null;
}

function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

async function _req(method, path, body) {
  const opts = { method, headers: authHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(getApiBase() + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export const apiGet    = (p)    => _req('GET',    p);
export const apiPost   = (p, b) => _req('POST',   p, b);
export const apiPatch  = (p, b) => _req('PATCH',  p, b);
export const apiDelete = (p)    => _req('DELETE', p);

export function saveSession(token, userId, username) {
  localStorage.setItem('warrcats_token',    token);
  localStorage.setItem('warrcats_user_id',  userId);
  localStorage.setItem('warrcats_username', username);
}

export function clearSession() {
  localStorage.removeItem('warrcats_token');
  localStorage.removeItem('warrcats_user_id');
  localStorage.removeItem('warrcats_username');
  localStorage.removeItem('warrcats_active_char_id');
}

export function getSession() {
  const token    = localStorage.getItem('warrcats_token');
  const userId   = localStorage.getItem('warrcats_user_id');
  const username = localStorage.getItem('warrcats_username');
  if (!token || !userId) return null;
  return { token, userId, username };
}

export async function fetchMe() {
  try { return await apiGet('/api/me'); }
  catch { return null; }
}

export async function apiRegister(username, email, password) {
  const data = await apiPost('/api/register', { username, email, password });
  saveSession(data.token, data.userId, data.username);
  return data;
}

export async function apiLogin(username, password) {
  const data = await apiPost('/api/login', { username, password });
  saveSession(data.token, data.userId, data.username);
  return data;
}

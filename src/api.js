// api.js
// Клиентский хелпер для общения с HTTP API сервера.
// Автоматически подставляет токен авторизации из localStorage.

// Базовый URL API — в dev-режиме сервер на 8080, в проде — тот же хост
export function getApiBase() {
  if (location.hostname === 'localhost') {
    return 'http://localhost:8080';
  }
  // На проде API на том же хосте/порту
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

export async function apiGet(path) {
  const res = await fetch(getApiBase() + path, {
    method: 'GET',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export async function apiPost(path, body) {
  const res = await fetch(getApiBase() + path, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export async function apiDelete(path) {
  const res = await fetch(getApiBase() + path, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

// ─── Авторизация ─────────────────────────────────────────────────────────────

export function saveSession(token, userId, username) {
  localStorage.setItem('warrcats_token',    token);
  localStorage.setItem('warrcats_user_id',  userId);
  localStorage.setItem('warrcats_username', username);
}

export function clearSession() {
  localStorage.removeItem('warrcats_token');
  localStorage.removeItem('warrcats_user_id');
  localStorage.removeItem('warrcats_username');
}

export function getSession() {
  const token    = localStorage.getItem('warrcats_token');
  const userId   = localStorage.getItem('warrcats_user_id');
  const username = localStorage.getItem('warrcats_username');
  if (!token || !userId) return null;
  return { token, userId, username };
}

// Проверить токен на сервере и вернуть данные пользователя + персонажей
// Возвращает null если токен протух
export async function fetchMe() {
  try {
    return await apiGet('/api/me');
  } catch {
    return null;
  }
}

// Регистрация
export async function apiRegister(username, password) {
  const data = await apiPost('/api/register', { username, password });
  saveSession(data.token, data.userId, data.username);
  return data;
}

// Логин
export async function apiLogin(username, password) {
  const data = await apiPost('/api/login', { username, password });
  saveSession(data.token, data.userId, data.username);
  return data;
}

// Сохранить персонажа на сервере
export async function apiSaveCharacter(charData) {
  const data = await apiPost('/api/characters', charData);
  return data.character;
}

// Удалить персонажа
export async function apiDeleteCharacter(charId) {
  return apiDelete(`/api/characters/${charId}`);
}

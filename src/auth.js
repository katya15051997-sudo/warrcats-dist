// auth.js
// Экран входа / регистрации.
// Показывается перед главным меню если пользователь не авторизован.
//
// Использование (в main.js или menu.js):
//   import { requireAuth } from './auth.js';
//   await requireAuth();  // ждём пока пользователь войдёт/зарегистрируется

import { apiLogin, apiRegister, fetchMe, getSession, clearSession } from './api.js';

// Стили экрана
const AUTH_CSS = `
  #auth-screen {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(5, 12, 5, 0.97);
    font-family: 'Ink Free', 'Segoe Print', cursive;
  }

  .auth-box {
    background: rgba(20, 35, 15, 0.98);
    border: 2px solid #8B5A2B;
    border-radius: 16px;
    padding: 36px 40px;
    width: 340px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .auth-title {
    font-size: 28px;
    color: #ffcc80;
    text-shadow: 2px 2px 0 #3a2410;
    margin: 0 0 4px;
  }

  .auth-subtitle {
    font-size: 13px;
    color: #9a8a6a;
    margin: -8px 0 4px;
  }

  .auth-tabs {
    display: flex;
    gap: 0;
    width: 100%;
    border-bottom: 2px solid #8B5A2B;
  }

  .auth-tab {
    flex: 1;
    padding: 8px;
    text-align: center;
    cursor: pointer;
    font-size: 14px;
    color: #c9bda0;
    border-radius: 8px 8px 0 0;
    transition: all 0.15s;
    user-select: none;
  }

  .auth-tab.active {
    background: rgba(139,90,43,0.4);
    color: #ffcc80;
    font-weight: bold;
  }

  .auth-tab:hover:not(.active) {
    background: rgba(139,90,43,0.15);
    color: #e8d8b0;
  }

  .auth-field {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .auth-field label {
    font-size: 12px;
    color: #9a8a6a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .auth-input {
    width: 100%;
    box-sizing: border-box;
    background: #0f1e0f;
    border: 1.5px solid #5a3a1a;
    border-radius: 8px;
    color: #ffcc80;
    font-size: 16px;
    padding: 10px 14px;
    outline: none;
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .auth-input:focus {
    border-color: #8B5A2B;
    box-shadow: 0 0 8px rgba(139,90,43,0.4);
  }

  .auth-btn {
    width: 100%;
    padding: 13px;
    background: rgba(139,90,43,0.6);
    border: 2px solid #8B5A2B;
    border-radius: 10px;
    color: #ffcc80;
    font-size: 16px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s;
    margin-top: 4px;
  }

  .auth-btn:hover:not(:disabled) {
    background: rgba(139,90,43,0.85);
    transform: scale(1.02);
  }

  .auth-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .auth-error {
    width: 100%;
    box-sizing: border-box;
    background: rgba(180,30,30,0.25);
    border: 1px solid rgba(200,50,50,0.5);
    border-radius: 8px;
    color: #ff9090;
    font-size: 13px;
    padding: 10px 14px;
    text-align: center;
    display: none;
  }

  .auth-error.visible { display: block; }

  .auth-guest {
    font-size: 12px;
    color: #6a5a4a;
    cursor: pointer;
    text-decoration: underline;
    margin-top: -4px;
    transition: color 0.15s;
  }

  .auth-guest:hover { color: #9a8a6a; }

  .auth-logo {
    width: 120px;
    margin-bottom: 4px;
  }
`;

function injectAuthStyles() {
  if (document.getElementById('auth-styles')) return;
  const style = document.createElement('style');
  style.id = 'auth-styles';
  style.textContent = AUTH_CSS;
  document.head.appendChild(style);
}

// ─── Главная функция ──────────────────────────────────────────────────────────

/**
 * Убедиться что пользователь авторизован.
 * Если уже есть валидный токен — возвращает данные сразу.
 * Иначе показывает экран входа и ждёт.
 * @returns {Promise<{userId, username, characters}>}
 */
export async function requireAuth() {
  injectAuthStyles();

  const session = getSession();
  if (session) {
    // Показываем заглушку немедленно — не ждём сервер
    const loadingEl = _showLoadingOverlay();

    const me = await fetchMe();
    loadingEl.remove();

    if (me) return me; // токен валидный
    // токен протух — чистим и показываем форму
    clearSession();
  }

  return new Promise((resolve) => {
    _showAuthScreen(resolve);
  });
}

function _showLoadingOverlay() {
  const el = document.createElement('div');
  el.id = 'auth-loading';
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    background: rgba(5, 12, 5, 0.97);
    font-family: 'Ink Free', 'Segoe Print', cursive;
    color: #ffcc80; font-size: 22px;
    text-shadow: 1px 1px 0 #3a2410;
  `;
  el.textContent = 'Загрузка…';
  document.body.appendChild(el);
  return el;
}

// ─── Рендер экрана ────────────────────────────────────────────────────────────

function _showAuthScreen(onSuccess) {
  let mode = 'login'; // 'login' | 'register'

  const screen = document.createElement('div');
  screen.id = 'auth-screen';
  screen.innerHTML = `
    <div class="auth-box">
      <img class="auth-logo" src="/assets/menu/warrcats.png" alt="WarrCats"
           onerror="this.style.display='none'">
      <div class="auth-title">WarrCats</div>
      <p class="auth-subtitle">Многопользовательская игра</p>

      <div class="auth-tabs">
        <div class="auth-tab active" id="auth-tab-login">Войти</div>
        <div class="auth-tab" id="auth-tab-register">Регистрация</div>
      </div>

      <div class="auth-field">
        <label>Имя пользователя</label>
        <input class="auth-input" id="auth-username" type="text"
               placeholder="от 2 до 24 символов" autocomplete="username" maxlength="24">
      </div>

      <div class="auth-field">
        <label>Пароль</label>
        <input class="auth-input" id="auth-password" type="password"
               placeholder="минимум 4 символа" autocomplete="current-password">
      </div>

      <div class="auth-error" id="auth-error"></div>

      <button class="auth-btn" id="auth-submit">Войти</button>
      <span class="auth-guest" id="auth-guest">Играть как гость (без сохранений)</span>
    </div>
  `;
  document.body.appendChild(screen);

  const tabLogin    = screen.querySelector('#auth-tab-login');
  const tabRegister = screen.querySelector('#auth-tab-register');
  const usernameEl  = screen.querySelector('#auth-username');
  const passwordEl  = screen.querySelector('#auth-password');
  const submitBtn   = screen.querySelector('#auth-submit');
  const errorEl     = screen.querySelector('#auth-error');
  const guestBtn    = screen.querySelector('#auth-guest');

  function setMode(m) {
    mode = m;
    tabLogin.classList.toggle('active', m === 'login');
    tabRegister.classList.toggle('active', m === 'register');
    submitBtn.textContent = m === 'login' ? 'Войти' : 'Зарегистрироваться';
    passwordEl.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('visible');
  }

  tabLogin.onclick    = () => setMode('login');
  tabRegister.onclick = () => setMode('register');

  // Enter в полях
  [usernameEl, passwordEl].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') submitBtn.click(); });
  });

  submitBtn.onclick = async () => {
    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    errorEl.classList.remove('visible');

    if (!username || !password) {
      showError('Заполните имя пользователя и пароль');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    try {
      let result;
      if (mode === 'login') {
        result = await apiLogin(username, password);
      } else {
        result = await apiRegister(username, password);
      }
      // Получаем полные данные (с персонажами)
      const me = await fetchMe();
      screen.remove();
      onSuccess(me ?? { userId: result.userId, username: result.username, characters: [] });
    } catch (e) {
      showError(e.message);
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
    }
  };

  guestBtn.onclick = () => {
    screen.remove();
    onSuccess({ userId: null, username: 'Гость', characters: [] });
  };

  usernameEl.focus();
}

// auth.js
// Модальное окно регистрации/входа — появляется поверх лендинга.
// Не занимает весь экран, не имеет собственного фона.
// Размер окна ~400×300px.

import { apiLogin, apiRegister, fetchMe, getSession, clearSession, saveSession } from '../net/api.js';

const AUTH_CSS = `
  #auth-overlay {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #auth-modal {
    background: rgba(18, 30, 14, 0.98);
    border: 2px solid #8B5A2B;
    border-radius: 14px;
    padding: 28px 32px 24px;
    width: 400px;
    max-width: calc(100vw - 32px);
    box-shadow: 0 8px 40px rgba(0,0,0,0.8);
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: 'Ink Free', 'Segoe Print', cursive;
    position: relative;
  }

  #auth-modal-close {
    position: absolute;
    top: 10px; right: 14px;
    background: none;
    border: none;
    color: #9a8a6a;
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
  }
  #auth-modal-close:hover { color: #ffcc80; }

  .auth-modal-tabs {
    display: flex;
    border-bottom: 1.5px solid #8B5A2B;
    margin-bottom: 4px;
  }
  .auth-modal-tab {
    flex: 1;
    padding: 6px;
    text-align: center;
    cursor: pointer;
    font-size: 13px;
    color: #c9bda0;
    border-radius: 8px 8px 0 0;
    transition: all 0.15s;
    user-select: none;
  }
  .auth-modal-tab.active {
    background: rgba(139,90,43,0.35);
    color: #ffcc80;
    font-weight: bold;
  }
  .auth-modal-tab:hover:not(.active) { color: #e8d8b0; }

  .auth-modal-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .auth-modal-field label {
    font-size: 11px;
    color: #9a8a6a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .auth-modal-input {
    background: #0a160a;
    border: 1.5px solid #5a3a1a;
    border-radius: 7px;
    color: #ffcc80;
    font-size: 14px;
    padding: 8px 12px;
    outline: none;
    font-family: inherit;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }
  .auth-modal-input:focus { border-color: #8B5A2B; }

  .auth-modal-hint {
    font-size: 11px;
    color: #6a5a4a;
    margin-top: -4px;
  }

  .auth-modal-error {
    background: rgba(180,30,30,0.2);
    border: 1px solid rgba(200,50,50,0.4);
    border-radius: 7px;
    color: #ff9090;
    font-size: 12px;
    padding: 8px 12px;
    display: none;
    text-align: center;
  }
  .auth-modal-error.visible { display: block; }

  .auth-modal-btn {
    background: rgba(139,90,43,0.55);
    border: 2px solid #8B5A2B;
    border-radius: 9px;
    color: #ffcc80;
    font-size: 14px;
    font-family: inherit;
    padding: 10px;
    cursor: pointer;
    transition: all 0.15s;
    margin-top: 2px;
  }
  .auth-modal-btn:hover:not(:disabled) {
    background: rgba(139,90,43,0.85);
    transform: scale(1.02);
  }
  .auth-modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;

function injectStyles() {
  if (document.getElementById('auth-modal-styles')) return;
  const s = document.createElement('style');
  s.id = 'auth-modal-styles';
  s.textContent = AUTH_CSS;
  document.head.appendChild(s);
}

// Открыть модальное окно. Возвращает Promise с данными пользователя.
export function openAuthModal() {
  injectStyles();
  return new Promise((resolve) => {
    _buildModal(resolve);
  });
}

// Проверить сохранённую сессию без показа UI.
// Возвращает данные пользователя или null.
export async function checkSession() {
  const session = getSession();
  if (!session) return null;
  const me = await fetchMe();
  if (!me) { clearSession(); return null; }
  return me;
}

// ─── Построение модала ────────────────────────────────────────────────────────

function _buildModal(onSuccess) {
  let mode = 'login';

  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';

  const modal = document.createElement('div');
  modal.id = 'auth-modal';

  modal.innerHTML = `
    <button id="auth-modal-close" title="Закрыть">✕</button>

    <div class="auth-modal-tabs" style="display:none">
      <div class="auth-modal-tab active" data-m="login">Войти</div>
      <div class="auth-modal-tab" data-m="register">Регистрация</div>
    </div>

    <div class="auth-modal-field">
      <label>Логин</label>
      <input class="auth-modal-input" id="am-username" type="text"
        placeholder="ваш логин" autocomplete="username" maxlength="24">
    </div>

    <div class="auth-modal-field" id="am-email-wrap" style="display:none">
      <label>Электронная почта</label>
      <input class="auth-modal-input" id="am-email" type="email"
        placeholder="example@mail.com" autocomplete="email">
    </div>

    <div class="auth-modal-field">
      <label>Пароль</label>
      <input class="auth-modal-input" id="am-password" type="password"
        placeholder="введите пароль" autocomplete="current-password">
      <div class="auth-modal-hint" id="am-pw-hint" style="display:none">
        Минимум 6 символов, заглавные и строчные буквы
      </div>
    </div>

    <div class="auth-modal-error" id="am-error"></div>

    <button class="auth-modal-btn" id="am-submit">Войти</button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // ── Элементы
  const tabs       = modal.querySelectorAll('.auth-modal-tab');
  const usernameEl = modal.querySelector('#am-username');
  const emailWrap  = modal.querySelector('#am-email-wrap');
  const emailEl    = modal.querySelector('#am-email');
  const passwordEl = modal.querySelector('#am-password');
  const pwHint     = modal.querySelector('#am-pw-hint');
  const errorEl    = modal.querySelector('#am-error');
  const submitBtn  = modal.querySelector('#am-submit');
  const closeBtn   = modal.querySelector('#auth-modal-close');

  function setMode(m) {
    mode = m;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.m === m));
    const isReg = m === 'register';
    emailWrap.style.display = isReg ? '' : 'none';
    pwHint.style.display    = isReg ? '' : 'none';
    passwordEl.autocomplete = isReg ? 'new-password' : 'current-password';
    submitBtn.textContent   = isReg ? 'Зарегистрироваться' : 'Войти';
    clearError();
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('visible');
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }

  function closeModal() {
    overlay.remove();
  }

  tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.m)));
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  [usernameEl, emailEl, passwordEl].forEach(el => {
    el?.addEventListener('keydown', e => { if (e.key === 'Enter') submitBtn.click(); });
  });

  submitBtn.addEventListener('click', async () => {
    clearError();
    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    const email    = emailEl.value.trim();

    if (!username || !password) {
      showError('Заполните логин и пароль');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    try {
      let me;
      if (mode === 'login') {
        const data = await apiLogin(username, password);
        me = await fetchMe();
        me = me ?? { userId: data.userId, username: data.username, characters: [] };
      } else {
        if (!email) { showError('Укажите электронную почту'); submitBtn.disabled = false; submitBtn.textContent = 'Зарегистрироваться'; return; }
        const data = await apiRegister(username, email, password);
        me = await fetchMe();
        me = me ?? { userId: data.userId, username: data.username, characters: [] };
      }
      closeModal();
      onSuccess(me);
    } catch (e) {
      showError(e.message);
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
    }
  });

  usernameEl.focus();
}

// notify.js
// Единое всплывающее уведомление (toast) в верхней части экрана.
// Раньше эта функция была скопирована в bunny.js, enemy-fox.js,
// day-night-cycle.js и world-objects.js — теперь она здесь одна.
//
// showToast('Текст');                                  // обычное уведомление
// showToast('Строка 1\nСтрока 2', { multiline: true }); // многострочное
// showToast('Урон!', { duration: 2400, fontSize: 14 });

export function showToast(text, { duration = 1800, fontSize = 15, multiline = false } = {}) {
  const note = document.createElement('div');
  note.textContent = text;
  note.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(15, 25, 15, 0.92); border: 2px solid #8B5A2B; border-radius: 8px;
    color: #ffcc80; font-family: Arial, sans-serif; font-size: ${fontSize}px; z-index: 250;
    padding: 8px 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    opacity: 0; transition: opacity 0.3s ease;
    ${multiline ? 'white-space: pre-line; text-align: center;' : ''}
  `;
  document.body.appendChild(note);

  requestAnimationFrame(() => {
    note.style.opacity = '1';
  });

  setTimeout(() => {
    note.style.opacity = '0';
    setTimeout(() => note.remove(), 300);
  }, duration);
}

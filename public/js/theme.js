/**
 * Theme Manager — Sistema RCV
 * Gestiona el modo claro y oscuro con persistencia en localStorage
 */
(function() {
  const savedTheme = localStorage.getItem('rcv_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('rcv_theme', newTheme);
  updateThemeUI(newTheme);
}

function updateThemeUI(theme) {
  const checkboxes = document.querySelectorAll('.theme-switch-checkbox');
  checkboxes.forEach(cb => { cb.checked = (theme === 'light'); });
  
  const textLabels = document.querySelectorAll('.theme-mode-text');
  textLabels.forEach(el => { el.textContent = theme === 'light' ? 'Modo Claro' : 'Modo Oscuro'; });

  const iconLabels = document.querySelectorAll('.theme-mode-icon');
  iconLabels.forEach(el => { el.textContent = theme === 'light' ? '☀️' : '🌙'; });

  const floatingIcons = document.querySelectorAll('.theme-toggle-floating .theme-icon');
  floatingIcons.forEach(el => { el.textContent = theme === 'light' ? '🌙' : '☀️'; });
}

document.addEventListener('DOMContentLoaded', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeUI(current);
});

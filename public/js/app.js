const API_URL = '';

(function() {
  const token = localStorage.getItem('rcv_token');
  if (token && (window.location.pathname === '/' || window.location.pathname === '/index.html')) {
    fetch(`${API_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => { if (r.ok) window.location.href = '/dashboard.html'; })
      .catch(() => {});
  }
})();

function showAuthMessage(msg, type = 'error') {
  const container = document.getElementById('authMessage');
  container.innerHTML = '';
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = msg;
  container.appendChild(alert);
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.innerHTML = '<span class="loading-spinner"></span> Iniciando...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('loginUser').value,
        password: document.getElementById('loginPass').value
      })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('rcv_token', data.token);
      localStorage.setItem('rcv_user', JSON.stringify(data.user));
      showAuthMessage('¡Bienvenido! Redirigiendo...', 'success');
      setTimeout(() => window.location.href = '/dashboard.html', 800);
    } else {
      showAuthMessage(data.error);
    }
  } catch (err) {
    showAuthMessage('Error de conexión al servidor.');
  }

  btn.innerHTML = 'Iniciar Sesión';
  btn.disabled = false;
}

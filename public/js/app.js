// ============================================
// Sistema RCV — Auth Logic (app.js)
// ============================================

const API_URL = '';

// Check if already logged in
(function() {
  const token = localStorage.getItem('rcv_token');
  if (token && window.location.pathname === '/' || window.location.pathname === '/index.html') {
    fetch(`${API_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => { if (r.ok) window.location.href = '/dashboard.html'; })
      .catch(() => {});
  }
})();

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('authMessage').innerHTML = '';
}

function showAuthMessage(msg, type = 'error') {
  document.getElementById('authMessage').innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
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

async function handleRegister(e) {
  e.preventDefault();
  const pass = document.getElementById('regPass').value;
  const confirm = document.getElementById('regPassConfirm').value;

  if (pass !== confirm) {
    showAuthMessage('Las contraseñas no coinciden.');
    return;
  }

  const btn = document.getElementById('regBtn');
  btn.innerHTML = '<span class="loading-spinner"></span> Registrando...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('regUser').value,
        email: document.getElementById('regEmail').value,
        password: pass
      })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('rcv_token', data.token);
      localStorage.setItem('rcv_user', JSON.stringify(data.user));
      showAuthMessage('¡Cuenta creada! Redirigiendo...', 'success');
      setTimeout(() => window.location.href = '/dashboard.html', 800);
    } else {
      showAuthMessage(data.error);
    }
  } catch (err) {
    showAuthMessage('Error de conexión al servidor.');
  }

  btn.innerHTML = 'Crear Cuenta';
  btn.disabled = false;
}

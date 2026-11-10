

const API = '';
let currentUser = null;
let searchTimeout = null;

(function() {
  const token = localStorage.getItem('rcv_token');
  const user = localStorage.getItem('rcv_user');

  if (!token || !user) {
    window.location.href = '/';
    return;
  }

  currentUser = JSON.parse(user);
  document.getElementById('userName').textContent = currentUser.username;
  document.getElementById('userRole').textContent = currentUser.role;
  document.getElementById('userAvatar').textContent = currentUser.username.charAt(0).toUpperCase();

  applyRoleVisibility();

  apiFetch('/api/auth/me').then(data => {
    if (!data || data.error || !data.user) {
      logout();
      return;
    }
    currentUser = data.user;
    localStorage.setItem('rcv_user', JSON.stringify(currentUser));
    document.getElementById('userName').textContent = currentUser.username;
    document.getElementById('userRole').textContent = currentUser.role;
    document.getElementById('userAvatar').textContent = currentUser.username.charAt(0).toUpperCase();
    applyRoleVisibility({ pruneAuditDom: true });
  }).catch(() => logout());

  if (typeof LOGO !== 'undefined' && LOGO) {
    const el = document.getElementById('sidebarLogoIcon');
    if (el) el.innerHTML = `<img src="${LOGO}" alt="Logo" style="height:50px;width:auto;object-fit:contain">`;
  }

  loadDashboard();
})();

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('rcv_token');
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    },
    ...options
  };

  try {
    const res = await fetch(`${API}${url}`, config);
    const data = await res.json();

    if (res.status === 401) {
      logout();
      throw new Error(data.error || 'Sesión expirada');
    }

    if (res.status === 403) {
      throw new Error(data.error || 'No tienes permisos para realizar esta acción');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Error en la solicitud');
    }

    return data;
  } catch (err) {
    if (err.message !== 'Failed to fetch') {
      showToast(err.message, 'error');
    }
    throw err;
  }
}

function getUserRole() {
  return String(currentUser?.role || '').toLowerCase().trim();
}

function isAdminUser() {
  const role = getUserRole();
  return role === 'admin' || role === 'superadmin';
}

function applyRoleVisibility({ pruneAuditDom = false } = {}) {
  const isAdmin = isAdminUser();
  const isSuper = getUserRole() === 'superadmin';
  const usersNav = document.querySelector('[data-section="users"]');
  if (usersNav) usersNav.style.display = isAdmin ? '' : 'none';

  const auditNav = document.querySelector('[data-section="audit"]');
  const auditSection = document.getElementById('section-audit');
  if (isSuper) {
    if (auditNav) auditNav.style.display = '';
  } else if (pruneAuditDom) {
    if (auditNav) auditNav.remove();
    if (auditSection) {
      if (auditSection.classList.contains('active')) navigateTo('dashboard');
      auditSection.remove();
    }
  } else if (auditNav) {
    auditNav.style.display = 'none';
  }

  const btnNewCov = document.getElementById('btnNewCoverage');
  if (btnNewCov) btnNewCov.style.display = isAdmin ? '' : 'none';
}

function navigateTo(section) {
  if (section === 'audit' && getUserRole() !== 'superadmin') {
    showToast('Acceso denegado. Sección exclusiva de Superadmin.', 'error');
    section = 'dashboard';
  }
  const targetSection = document.getElementById(`section-${section}`);
  const targetNav = document.querySelector(`[data-section="${section}"]`);
  if (!targetSection || !targetNav) return;

  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  targetSection.classList.add('active');
  targetNav.classList.add('active');

  if (section === 'dashboard') loadDashboard();
  if (section === 'clients') loadClients();
  if (section === 'policies') loadPolicies();
  if (section === 'coverages') loadCoverages();
  if (section === 'users') loadUsers();
  if (section === 'audit') loadAuditLogs();

  toggleSidebar(false);
}

function toggleSidebar(force) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const shouldOpen = typeof force === 'boolean' ? force : !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', shouldOpen);
  if (backdrop) backdrop.classList.toggle('active', shouldOpen);
}

function logout() {
  localStorage.removeItem('rcv_token');
  localStorage.removeItem('rcv_user');
  window.location.href = '/';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && overlay.id !== 'coverageModal') overlay.classList.remove('active');
  });
});

let confirmCallback = null;

function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = callback;
  document.getElementById('confirmBtn').onclick = () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  };
  document.getElementById('confirmDialog').classList.add('active');
}

function closeConfirm() {
  document.getElementById('confirmDialog').classList.remove('active');
  confirmCallback = null;
}

function debounceSearch(fn) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(fn, 250);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toInputDate(dateStr) {
  if (!dateStr) return '';
  const iso = String(dateStr).slice(0, 10);
  if (iso === '0000-00-00' || iso === '1899-11-30' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return '';
  }
  return iso;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(amount) {
  if (amount === undefined || amount === null || amount === '') return '—';
  return '€ ' + Number(amount).toLocaleString('es-VE', { minimumFractionDigits: 2 });
}

function statusBadge(status) {
  const labels = { activa: 'Activa', pendiente: 'Pendiente', vencida: 'Vencida', cancelada: 'Cancelada' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function roleBadge(role) {
  return `<span class="badge badge-${role}">${role}</span>`;
}

function coverageLabel(cov) {
  return cov || '—';
}

function vehicleLabel(tipo) {
  const labels = { automovil: 'Automóvil', camioneta: 'Camioneta', moto: 'Moto', camion: 'Camión', bus: 'Bus' };
  return labels[tipo] || tipo;
}

async function loadDashboard() {
  try {
    const data = await apiFetch('/api/dashboard/stats');
    const s = data.stats;

    document.getElementById('statClients').textContent = s.totalClients;
    document.getElementById('statActivePolicies').textContent = s.activePolicies;
    document.getElementById('statPendingPolicies').textContent = s.pendingPolicies;
    document.getElementById('statExpiredPolicies').textContent = s.expiredPolicies;
    document.getElementById('statTotalPrimas').textContent = formatCurrency(s.totalPrimas);
    document.getElementById('statTotalMontos').textContent = formatCurrency(s.totalMontos);

    const clientsList = document.getElementById('recentClientsList');
    if (data.recentClients.length === 0) {
      clientsList.innerHTML = '<div class="table-empty"><div class="empty-icon">📭</div><p>No hay clientes registrados</p></div>';
    } else {
      clientsList.innerHTML = data.recentClients.map(c => `
        <div class="list-item">
          <div class="list-item-icon" style="background:var(--accent-soft);color:var(--accent)">👤</div>
          <div class="list-item-content">
            <div class="title">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</div>
            <div class="subtitle">${escapeHtml(c.cedula)} ${c.ciudad ? '· ' + escapeHtml(c.ciudad) : ''}</div>
          </div>
        </div>
      `).join('');
    }

    const policiesList = document.getElementById('recentPoliciesList');
    if (data.recentPolicies.length === 0) {
      policiesList.innerHTML = '<div class="table-empty"><div class="empty-icon">📭</div><p>No hay pólizas creadas</p></div>';
    } else {
      policiesList.innerHTML = data.recentPolicies.map(p => `
        <div class="list-item">
          <div class="list-item-icon" style="background:var(--success-soft);color:var(--success)">📋</div>
          <div class="list-item-content">
            <div class="title">${escapeHtml(p.policy_number)}</div>
            <div class="subtitle">${escapeHtml(p.client_name)} · ${escapeHtml(vehicleLabel(p.tipo_vehiculo))} · ${escapeHtml(p.placa)}</div>
          </div>
          ${statusBadge(p.estado)}
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

let clientsPage = 1;

async function loadClients(page = 1) {
  clientsPage = page;
  const search = document.getElementById('clientSearch')?.value || '';

  try {
    const data = await apiFetch(`/api/clients?page=${page}&limit=15&search=${encodeURIComponent(search)}`);
    const tbody = document.getElementById('clientsTableBody');

    if (data.clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">👥</div><p>No se encontraron clientes</p></div></td></tr>';
    } else {
      tbody.innerHTML = data.clients.map(c => `
        <tr>
          <td data-label="Documento ID"><strong>${escapeHtml(c.cedula)}</strong></td>
          <td data-label="Nombre">${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</td>
          <td data-label="Teléfono">${escapeHtml(c.telefono) || '—'}</td>
          <td data-label="Email">${escapeHtml(c.email) || '—'}</td>
          <td data-label="Ciudad">${escapeHtml(c.ciudad) || '—'}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editClient(${Number(c.id)})">✏️</button>
              ${isAdminUser() ? `<button class="btn btn-sm btn-danger btn-icon" title="Eliminar" data-name="${escapeHtml(c.nombre + ' ' + c.apellido)}" onclick="deleteClient(${Number(c.id)}, this.dataset.name)">🗑️</button>` : ''}
            </div>
          </td>
        </tr>
      `).join('');
    }

    document.getElementById('clientsCount').textContent = `${data.pagination.total} cliente(s)`;
    renderPagination('clientsPagination', data.pagination, loadClients);
  } catch (err) {
    console.error('Error loading clients:', err);
  }
}

function parseDocumentId(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/^([VEJvej])[-.\s]*(.*)$/);
  if (match) {
    return {
      prefix: `${match[1].toUpperCase()}-`,
      number: match[2].replace(/\D/g, '')
    };
  }
  return {
    prefix: 'V-',
    number: value.replace(/\D/g, '')
  };
}

function updateDocIdPlaceholder() {
  const prefixEl = document.getElementById('clientDocType');
  const numEl = document.getElementById('clientCedula');
  if (!prefixEl || !numEl) return;
  numEl.placeholder = prefixEl.value === 'J-' ? '0000000000' : '000000000';
}

function handleDocIdInput(input) {
  const raw = input.value;
  const prefixMatch = raw.match(/^\s*([VEJvej])[-.\s]*(.*)$/);
  if (prefixMatch) {
    const prefixEl = document.getElementById('clientDocType');
    if (prefixEl) {
      prefixEl.value = `${prefixMatch[1].toUpperCase()}-`;
      updateDocIdPlaceholder();
    }
    input.value = prefixMatch[2].replace(/\D/g, '');
  } else {
    input.value = raw.replace(/\D/g, '');
  }
}

function openClientModal(client = null) {
  document.getElementById('clientForm').reset();
  document.getElementById('clientId').value = '';
  document.getElementById('clientDocType').value = 'V-';
  updateDocIdPlaceholder();
  document.getElementById('clientModalTitle').textContent = client ? 'Editar Cliente' : 'Nuevo Cliente';

  if (client) {
    const parsedDoc = parseDocumentId(client.cedula);
    document.getElementById('clientId').value = client.id;
    document.getElementById('clientDocType').value = parsedDoc.prefix;
    document.getElementById('clientCedula').value = parsedDoc.number;
    updateDocIdPlaceholder();
    document.getElementById('clientNombre').value = client.nombre;
    document.getElementById('clientApellido').value = client.apellido;
    document.getElementById('clientTelefono').value = client.telefono || '';
    document.getElementById('clientEmail').value = client.email || '';
    document.getElementById('clientDireccion').value = client.direccion || '';
    document.getElementById('clientCiudad').value = client.ciudad || '';
    document.getElementById('clientEstado').value = client.estado_region || '';
    document.getElementById('clientFechaNac').value = toInputDate(client.fecha_nacimiento);
  }

  openModal('clientModal');
}

async function editClient(id) {
  try {
    const data = await apiFetch(`/api/clients/${id}`);
    openClientModal(data.client);
  } catch (err) {
    console.error('Error fetching client:', err);
  }
}

async function saveClient(e) {
  e.preventDefault();
  const id = document.getElementById('clientId').value;
  const docPrefix = document.getElementById('clientDocType').value || 'V-';
  const docDigits = document.getElementById('clientCedula').value.replace(/\D/g, '');
  if (!docDigits) {
    showToast('Ingrese el número de Documento ID.', 'warning');
    return;
  }

  const body = {
    cedula: `${docPrefix}${docDigits}`,
    nombre: document.getElementById('clientNombre').value,
    apellido: document.getElementById('clientApellido').value,
    telefono: document.getElementById('clientTelefono').value,
    email: document.getElementById('clientEmail').value,
    direccion: document.getElementById('clientDireccion').value,
    ciudad: document.getElementById('clientCiudad').value,
    estado_region: document.getElementById('clientEstado').value,
    fecha_nacimiento: document.getElementById('clientFechaNac').value
  };

  try {
    if (id) {
      await apiFetch(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Cliente actualizado exitosamente', 'success');
    } else {
      await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(body) });
      showToast('Cliente creado exitosamente', 'success');
    }

    closeModal('clientModal');
    cachedCompactClients = null;
    loadClients(clientsPage);
  } catch (err) {
    console.error('Error saving client:', err);
  }
}

function deleteClient(id, name) {
  showConfirm(
    '¿Eliminar cliente?',
    `Se eliminará el cliente "${name}". Los clientes con pólizas activas no pueden ser eliminados.`,
    async () => {
      try {
        await apiFetch(`/api/clients/${id}`, { method: 'DELETE' });
        showToast('Cliente eliminado exitosamente', 'success');
        cachedCompactClients = null;
        loadClients(clientsPage);
      } catch (err) {
        console.error('Error deleting client:', err);
      }
    }
  );
}

let policiesPage = 1;

async function loadPolicies(page = 1) {
  policiesPage = page;
  const search = document.getElementById('policySearch')?.value || '';
  const filterVal = document.getElementById('policyStatusFilter')?.value || '';
  const estado = filterVal === 'expiring' ? '' : filterVal;
  const expiringParam = filterVal === 'expiring' ? '&expiring=1' : '';

  try {
    const data = await apiFetch(`/api/policies?page=${page}&limit=15&search=${encodeURIComponent(search)}&estado=${encodeURIComponent(estado)}${expiringParam}`);
    const tbody = document.getElementById('policiesTableBody');

    if (data.policies.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="table-empty"><div class="empty-icon">📋</div><p>No se encontraron pólizas</p></div></td></tr>';
    } else {
      tbody.innerHTML = data.policies.map(p => {

        const now = new Date();
        const expDate = new Date(p.fecha_fin);
        const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
        const expiring = p.estado === 'activa' && daysLeft >= 0 && daysLeft <= 15;
        const expiringIcon = expiring ? ' <span title="Póliza próxima a vencer, contacte al cliente" style="cursor:help;font-size:1.1em;animation:pulse 1.5s infinite">⚠️</span>' : '';

        return `
        <tr${expiring ? ' style="background:rgba(255,165,0,0.07)"' : ''}>
          <td data-label="Nº Póliza"><strong>${escapeHtml(p.policy_number)}</strong></td>
          <td data-label="Cliente">${escapeHtml(p.client_name)}</td>
          <td data-label="Vehículo">${escapeHtml(vehicleLabel(p.tipo_vehiculo))} ${escapeHtml(p.marca)} ${escapeHtml(p.modelo)}</td>
          <td data-label="Placa">${escapeHtml(p.placa)}</td>
          <td data-label="Cobertura">${escapeHtml(coverageLabel(p.cobertura))}</td>
          <td data-label="Prima">${formatCurrency(p.prima)}</td>
          <td data-label="Estado">${statusBadge(p.estado)}${expiringIcon}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-sm btn-secondary btn-icon" title="Imprimir Carta" onclick="printPolicy(${Number(p.id)}, 'carta')">📄</button>
              <button class="btn btn-sm btn-primary btn-icon" title="Renovar" data-policy="${escapeHtml(p.policy_number)}" onclick="renewPolicy(${Number(p.id)}, this.dataset.policy)">🔄</button>
              <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editPolicy(${Number(p.id)})">✏️</button>
              ${isAdminUser() ? `<button class="btn btn-sm btn-danger btn-icon" title="Eliminar" data-policy="${escapeHtml(p.policy_number)}" onclick="deletePolicy(${Number(p.id)}, this.dataset.policy)">🗑️</button>` : ''}
            </div>
          </td>
        </tr>
      `}).join('');
    }

    document.getElementById('policiesCount').textContent = `${data.pagination.total} póliza(s)`;
    renderPagination('policiesPagination', data.pagination, loadPolicies);
  } catch (err) {
    console.error('Error loading policies:', err);
  }
}

let cachedCompactClients = null;
let cachedActiveCoverages = null;
let policyClientSearchTimer = null;

function renderPolicyClientSelect(clients, selectedId = null) {
  const select = document.getElementById('policyClient');
  if (!select) return;
  const currentVal = selectedId !== null ? String(selectedId) : select.value;
  select.innerHTML = '<option value="">Seleccione un cliente</option>' +
    clients.map(c =>
      `<option value="${Number(c.id)}">${escapeHtml(c.cedula)} — ${escapeHtml(c.nombre)} ${escapeHtml(c.apellido)}</option>`
    ).join('');
  if (currentVal && [...select.options].some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

function filterPolicyClientOptions(term) {
  clearTimeout(policyClientSearchTimer);
  const query = String(term || '').trim();
  const select = document.getElementById('policyClient');
  const selectedVal = select ? select.value : '';

  policyClientSearchTimer = setTimeout(async () => {
    try {
      if (!query) {
        if (cachedCompactClients) {
          renderPolicyClientSelect(cachedCompactClients.clients, selectedVal);
        }
        return;
      }
      const data = await apiFetch(`/api/clients?compact=1&limit=50&search=${encodeURIComponent(query)}`);
      renderPolicyClientSelect(data.clients, selectedVal);
      if (data.clients.length === 1 && select) {
        select.value = String(data.clients[0].id);
      }
    } catch (err) {
      console.error('Error searching clients:', err);
    }
  }, 220);
}

async function exportPoliciesCsv() {
  const token = localStorage.getItem('rcv_token');
  if (!token) return;
  const search = document.getElementById('policySearch')?.value || '';
  const filterVal = document.getElementById('policyStatusFilter')?.value || '';
  const estado = filterVal === 'expiring' ? '' : filterVal;
  const expiringParam = filterVal === 'expiring' ? '&expiring=1' : '';

  try {
    const res = await fetch(`${API}/api/policies/export?search=${encodeURIComponent(search)}&estado=${encodeURIComponent(estado)}${expiringParam}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('No se pudo exportar el archivo CSV');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polizas_rcv_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Exportación CSV descargada', 'success');
  } catch (err) {
    showToast(err.message || 'Error al exportar CSV', 'error');
  }
}

async function openPolicyModal(policy = null) {
  document.getElementById('policyForm').reset();
  document.getElementById('policyId').value = '';
  const searchInput = document.getElementById('policyClientSearch');
  if (searchInput) searchInput.value = '';
  document.getElementById('policyModalTitle').textContent = policy ? 'Editar Póliza' : 'Nueva Póliza';

  try {
    const [clientsData, covData] = await Promise.all([
      cachedCompactClients ? Promise.resolve(cachedCompactClients) : apiFetch('/api/clients?limit=1000&compact=1'),
      cachedActiveCoverages ? Promise.resolve(cachedActiveCoverages) : apiFetch('/api/coverages')
    ]);
    cachedCompactClients = clientsData;
    cachedActiveCoverages = covData;

    const list = [...clientsData.clients];
    if (policy && policy.client_id && !list.some(c => Number(c.id) === Number(policy.client_id))) {
      list.unshift({
        id: policy.client_id,
        cedula: policy.client_cedula || '',
        nombre: policy.client_name || 'Cliente actual',
        apellido: ''
      });
    }
    renderPolicyClientSelect(list, policy ? policy.client_id : '');

    const covSelect = document.getElementById('policyCobertura');
    covSelect.innerHTML = '<option value="">Seleccione cobertura</option>' +
      covData.coverages.map(c =>
        `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}${c.descripcion ? ' — ' + escapeHtml(c.descripcion) : ''}</option>`
      ).join('');
  } catch (err) {
    console.error('Error loading modal options for policy:', err);
  }

  if (!policy) {
    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    document.getElementById('policyFechaInicio').value = today;
    document.getElementById('policyFechaFin').value = nextYear;
  }

  if (policy) {
    document.getElementById('policyId').value = policy.id;
    document.getElementById('policyClient').value = policy.client_id;
    document.getElementById('policyTipoVehiculo').value = policy.tipo_vehiculo;
    document.getElementById('policyPlaca').value = policy.placa;
    document.getElementById('policyMarca').value = policy.marca;
    document.getElementById('policyModelo').value = policy.modelo;
    document.getElementById('policyAnio').value = policy.anio;
    document.getElementById('policyColor').value = policy.color || '';
    document.getElementById('policySerial').value = policy.serial_carroceria || '';
    document.getElementById('policySerialMotor').value = policy.serial_motor || '';
    document.getElementById('policyCobertura').value = policy.cobertura;
    document.getElementById('policyFechaInicio').value = toInputDate(policy.fecha_inicio);
    document.getElementById('policyFechaFin').value = toInputDate(policy.fecha_fin);
    document.getElementById('policyNotas').value = policy.notas || '';
  }

  openModal('policyModal');
}

async function editPolicy(id) {
  try {
    const data = await apiFetch(`/api/policies/${id}`);
    openPolicyModal(data.policy);
  } catch (err) {
    console.error('Error fetching policy:', err);
  }
}

async function savePolicy(e) {
  e.preventDefault();
  const id = document.getElementById('policyId').value;

  if (id) {

    const body = {
      cobertura: document.getElementById('policyCobertura').value,
      fecha_inicio: document.getElementById('policyFechaInicio').value,
      fecha_fin: document.getElementById('policyFechaFin').value,
      notas: document.getElementById('policyNotas').value,
      placa: document.getElementById('policyPlaca').value,
      marca: document.getElementById('policyMarca').value,
      modelo: document.getElementById('policyModelo').value,
      anio: Number(document.getElementById('policyAnio').value),
      color: document.getElementById('policyColor').value,
      serial_carroceria: document.getElementById('policySerial').value,
      serial_motor: document.getElementById('policySerialMotor').value
    };

    try {
      await apiFetch(`/api/policies/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Póliza actualizada exitosamente', 'success');
      closeModal('policyModal');
      loadPolicies(policiesPage);
    } catch (err) {
      console.error('Error updating policy:', err);
    }
  } else {
    const body = {
      client_id: Number(document.getElementById('policyClient').value),
      tipo_vehiculo: document.getElementById('policyTipoVehiculo').value,
      placa: document.getElementById('policyPlaca').value,
      marca: document.getElementById('policyMarca').value,
      modelo: document.getElementById('policyModelo').value,
      anio: Number(document.getElementById('policyAnio').value),
      color: document.getElementById('policyColor').value,
      serial_carroceria: document.getElementById('policySerial').value,
      serial_motor: document.getElementById('policySerialMotor').value,
      cobertura: document.getElementById('policyCobertura').value,
      fecha_inicio: document.getElementById('policyFechaInicio').value,
      fecha_fin: document.getElementById('policyFechaFin').value,
      notas: document.getElementById('policyNotas').value
    };

    try {
      await apiFetch('/api/policies', { method: 'POST', body: JSON.stringify(body) });
      showToast('Póliza creada exitosamente', 'success');
      closeModal('policyModal');
      loadPolicies(policiesPage);
    } catch (err) {
      console.error('Error creating policy:', err);
    }
  }
}

function deletePolicy(id, number) {
  showConfirm(
    '¿Eliminar póliza?',
    `Se eliminará la póliza "${number}" permanentemente.`,
    async () => {
      try {
        await apiFetch(`/api/policies/${id}`, { method: 'DELETE' });
        showToast('Póliza eliminada exitosamente', 'success');
        loadPolicies(policiesPage);
      } catch (err) {
        console.error('Error deleting policy:', err);
      }
    }
  );
}

async function loadCoverages() {
  try {
    const data = await apiFetch('/api/coverages?all=1');
    const tbody = document.getElementById('coveragesTableBody');

    if (data.coverages.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="table-empty"><div class="empty-icon">🛡️</div><p>No hay coberturas configuradas</p></div></td></tr>';
    } else {
      tbody.innerHTML = data.coverages.map(c => {

        let itemCount = 0, totalMonto = 0;
        for (let i = 1; i <= 10; i++) {
          if (c[`cob_${i}_nombre`]) { itemCount++; totalMonto += Number(c[`cob_${i}_monto`]) || 0; }
        }
        return `
        <tr style="${!c.active ? 'opacity:0.5' : ''}">
          <td data-label="Nombre"><strong>${escapeHtml(c.nombre)}</strong></td>
          <td data-label="Descripción">${escapeHtml(c.descripcion) || '—'}</td>
          <td data-label="Prima Anual">${formatCurrency(c.prima)}</td>
          <td data-label="Monto Total">${formatCurrency(totalMonto)}</td>
          <td data-label="Coberturas">${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
          <td data-label="Estado">${c.active ? '<span class="badge badge-activa">Activa</span>' : '<span class="badge badge-cancelada">Inactiva</span>'}</td>
          <td>
            <div class="actions-cell">
              ${isAdminUser() ? `
                <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editCoverage(${Number(c.id)})">✏️</button>
                <button class="btn btn-sm btn-secondary btn-icon" title="${c.active ? 'Desactivar' : 'Activar'}" onclick="toggleCoverage(${Number(c.id)}, ${c.active ? 1 : 0})">${c.active ? '⏸' : '▶️'}</button>
                <button class="btn btn-sm btn-danger btn-icon" title="Eliminar" data-name="${escapeHtml(c.nombre)}" onclick="deleteCoverage(${Number(c.id)}, this.dataset.name)">🗑️</button>
              ` : '<span style="color:var(--text-muted);font-size:0.8rem">Solo lectura</span>'}
            </div>
          </td>
        </tr>
      `}).join('');
    }
  } catch (err) {
    console.error('Error loading coverages:', err);
  }
}

function renderCoverageItems(coverage) {
  const container = document.getElementById('coverageItemsContainer');
  let html = '';
  for (let i = 1; i <= 10; i++) {
    const nameVal = coverage ? (coverage[`cob_${i}_nombre`] || '') : '';
    const montoVal = coverage ? (coverage[`cob_${i}_monto`] || 0) : 0;
    html += `
      <div class="form-row" style="margin-bottom:0.3rem">
        <div class="form-group" style="flex:2">
          ${i === 1 ? '<label style="font-size:0.7rem;color:var(--text-muted,#888)">Nombre</label>' : ''}
          <input type="text" id="cob${i}Nombre" class="form-control" placeholder="Cobertura ${i}" value="${escapeHtml(nameVal)}" style="font-size:0.85rem">
        </div>
        <div class="form-group" style="flex:1">
          ${i === 1 ? '<label style="font-size:0.7rem;color:var(--text-muted,#888)">Monto (€)</label>' : ''}
          <input type="number" step="0.01" min="0" id="cob${i}Monto" class="form-control" value="${montoVal}" style="font-size:0.85rem">
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

function openCoverageModal(coverage = null) {
  document.getElementById('coverageForm').reset();
  document.getElementById('coverageId').value = '';
  document.getElementById('coverageModalTitle').textContent = coverage ? 'Editar Cobertura' : 'Nueva Cobertura';

  if (coverage) {
    document.getElementById('coverageId').value = coverage.id;
    document.getElementById('coverageNombre').value = coverage.nombre;
    document.getElementById('coverageDescripcion').value = coverage.descripcion || '';
    document.getElementById('coveragePrima').value = coverage.prima || 0;
  }

  renderCoverageItems(coverage);
  openModal('coverageModal');
}

async function editCoverage(id) {
  try {
    const data = await apiFetch(`/api/coverages/${id}`);
    openCoverageModal(data.coverage);
  } catch (err) {
    console.error('Error fetching coverage:', err);
  }
}

async function saveCoverage(e) {
  e.preventDefault();
  const id = document.getElementById('coverageId').value;
  const body = {
    nombre: document.getElementById('coverageNombre').value,
    descripcion: document.getElementById('coverageDescripcion').value,
    prima: document.getElementById('coveragePrima').value
  };

  for (let i = 1; i <= 10; i++) {
    body[`cob_${i}_nombre`] = document.getElementById(`cob${i}Nombre`).value || null;
    body[`cob_${i}_monto`] = document.getElementById(`cob${i}Monto`).value || 0;
  }

  try {
    if (id) {
      await apiFetch(`/api/coverages/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Cobertura actualizada exitosamente', 'success');
    } else {
      await apiFetch('/api/coverages', { method: 'POST', body: JSON.stringify(body) });
      showToast('Cobertura creada exitosamente', 'success');
    }
    closeModal('coverageModal');
    cachedActiveCoverages = null;
    loadCoverages();
  } catch (err) {
    console.error('Error saving coverage:', err);
  }
}

async function toggleCoverage(id, currentActive) {
  try {
    await apiFetch(`/api/coverages/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: currentActive ? 0 : 1 })
    });
    showToast(`Cobertura ${currentActive ? 'desactivada' : 'activada'} exitosamente`, 'success');
    cachedActiveCoverages = null;
    loadCoverages();
  } catch (err) {
    console.error('Error toggling coverage:', err);
  }
}

function deleteCoverage(id, name) {
  showConfirm(
    '¿Eliminar cobertura?',
    `Se eliminará la cobertura "${name}". Si tiene pólizas asociadas, no podrá ser eliminada.`,
    async () => {
      try {
        await apiFetch(`/api/coverages/${id}`, { method: 'DELETE' });
        showToast('Cobertura eliminada exitosamente', 'success');
        cachedActiveCoverages = null;
        loadCoverages();
      } catch (err) {
        console.error('Error deleting coverage:', err);
      }
    }
  );
}

async function loadUsers() {
  try {
    const data = await apiFetch('/api/users');
    const tbody = document.getElementById('usersTableBody');

    const viewerRole = getUserRole();
    const visibleUsers = viewerRole === 'superadmin'
      ? data.users
      : data.users.filter(u => String(u.role || '').toLowerCase().trim() !== 'superadmin');

    if (visibleUsers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">⚙️</div><p>No hay usuarios registrados</p></div></td></tr>';
    } else {
      tbody.innerHTML = visibleUsers.map(u => {
        const targetRole = String(u.role || '').toLowerCase().trim();
        const canEdit = viewerRole === 'superadmin' || targetRole === 'register' || u.id === currentUser.id;
        const canDelete = u.id !== currentUser.id && (viewerRole === 'superadmin' || targetRole === 'register');
        return `
        <tr>
          <td><strong>${escapeHtml(u.username)}</strong></td>
          <td>${escapeHtml(u.email)}</td>
          <td>${roleBadge(escapeHtml(u.role))}</td>
          <td>${u.active ? '<span class="badge badge-activa">Activo</span>' : '<span class="badge badge-cancelada">Inactivo</span>'}</td>
          <td>${formatDate(u.created_at)}</td>
          <td>
            <div class="actions-cell">
              ${canEdit ? `<button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editUser(${Number(u.id)})">✏️</button>` : ''}
              ${canDelete ? `<button class="btn btn-sm btn-danger btn-icon" title="Eliminar" data-username="${escapeHtml(u.username)}" onclick="deleteUser(${Number(u.id)}, this.dataset.username)">🗑️</button>` : ''}
            </div>
          </td>
        </tr>
      `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function openUserModal(user = null) {
  document.getElementById('userForm').reset();
  document.getElementById('userId').value = '';

  const hintField = document.getElementById('userPasswordHint');
  if (hintField) hintField.value = '';

  const safeRole = String(currentUser.role).toLowerCase().trim();
  const roleSelect = document.getElementById('userRoleField');

  if (roleSelect) {
    if (safeRole !== 'superadmin') {
      roleSelect.innerHTML = `
        <option value="register">Register (Operador)</option>
        <option value="admin">Admin</option>
      `;
    } else {
      roleSelect.innerHTML = `
        <option value="register">Register (Operador)</option>
        <option value="admin">Admin</option>
        <option value="superadmin">Super Admin</option>
      `;
    }
  }

  if (user) {
    document.getElementById('userId').value = user.id;
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userEmailField').value = user.email;

    if (hintField && user.password_hint) hintField.value = user.password_hint;

    if (roleSelect) {
      if ([...roleSelect.options].some(opt => opt.value === user.role)) {
        roleSelect.value = user.role;
      } else {
        roleSelect.value = 'register';
      }
    }

    document.getElementById('userModalTitle').textContent = 'Editar Usuario';
  } else {
    document.getElementById('userModalTitle').textContent = 'Nuevo Usuario';
  }

  openModal('userModal');
}

async function editUser(id) {
  try {
    const data = await apiFetch('/api/users');
    const user = data.users.find(u => u.id === id);
    if (!user) return;
    openUserModal(user);
  } catch (err) {
    console.error('Error fetching user:', err);
  }
}

async function saveUser(e) {
  e.preventDefault();
  const id = document.getElementById('userId').value;
  const hintField = document.getElementById('userPasswordHint');

  const body = {
    username: document.getElementById('userUsername').value,
    email: document.getElementById('userEmailField').value,
    role: document.getElementById('userRoleField').value,
    password_hint: hintField ? hintField.value : ''
  };

  const password = document.getElementById('userPassword').value;
  if (password) body.password = password;

  if (!id && !password) {
    showToast('La contraseña es obligatoria para un usuario nuevo.', 'warning');
    return;
  }

  try {
    if (id) {
      await apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Usuario actualizado exitosamente', 'success');

      if (Number(id) === currentUser.id) {
        currentUser.username = body.username;
        currentUser.email = body.email;
        currentUser.role = body.role;
        localStorage.setItem('rcv_user', JSON.stringify(currentUser));
        document.getElementById('userName').textContent = currentUser.username;
        document.getElementById('userRole').textContent = currentUser.role;
        document.getElementById('userAvatar').textContent = currentUser.username.charAt(0).toUpperCase();
      }
    } else {
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(body) });
      showToast('Usuario creado exitosamente', 'success');
    }

    closeModal('userModal');
    loadUsers();
  } catch (err) {
    console.error('Error saving user:', err);
  }
}

function deleteUser(id, username) {
  showConfirm(
    '¿Eliminar usuario?',
    `Se eliminará el usuario "${username}" permanentemente.`,
    async () => {
      try {
        await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
        showToast('Usuario eliminado exitosamente', 'success');
        loadUsers();
      } catch (err) {
        console.error('Error deleting user:', err);
      }
    }
  );
}

function renderPagination(containerId, pagination, loadFn) {
  const container = document.getElementById(containerId);
  if (pagination.pages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  html += `<button ${pagination.page <= 1 ? 'disabled' : ''} onclick="${loadFn.name}(${pagination.page - 1})">‹</button>`;

  for (let i = 1; i <= pagination.pages; i++) {
    if (pagination.pages > 7 && i > 3 && i < pagination.pages - 2 && Math.abs(i - pagination.page) > 1) {
      if (i === 4) html += '<button disabled>…</button>';
      continue;
    }
    html += `<button class="${i === pagination.page ? 'active' : ''}" onclick="${loadFn.name}(${i})">${i}</button>`;
  }

  html += `<button ${pagination.page >= pagination.pages ? 'disabled' : ''} onclick="${loadFn.name}(${pagination.page + 1})">›</button>`;

  container.innerHTML = html;
}

function printPolicy(id, format) {
  window.open(`/print.html?id=${id}&format=${format}`, '_blank');
}

function renewPolicy(id, policyNumber) {
  showConfirm(
    '¿Renovar póliza?',
    `Se renovará la póliza "${policyNumber}":\n• Fecha de emisión → hoy\n• Fecha de vencimiento → dentro de 1 año\n• Estado → Activa\n• Prima y monto se recalcularán con tarifas actuales`,
    async () => {
      try {
        await apiFetch(`/api/policies/${id}/renew`, { method: 'POST' });
        showToast('Póliza renovada exitosamente', 'success');
        loadPolicies(policiesPage);
      } catch (err) {
        console.error('Error renewing policy:', err);
      }
    }
  );
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    closeConfirm();
  }
});

let auditPage = 1;

async function loadAuditLogs(page = 1) {
  if (getUserRole() !== 'superadmin') return;
  auditPage = page;
  const entity = document.getElementById('auditEntityFilter')?.value || '';
  try {
    const data = await apiFetch(`/api/audit?page=${page}&limit=25&entity=${encodeURIComponent(entity)}`);
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;

    if (!data.logs.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="table-empty"><div class="empty-icon">🛡️</div><p>Sin eventos registrados</p></div></td></tr>';
    } else {
      tbody.innerHTML = data.logs.map(l => `
        <tr>
          <td>${new Date(l.created_at).toLocaleString('es-VE')}</td>
          <td><strong>${escapeHtml(l.username)}</strong></td>
          <td><span class="badge badge-${l.action === 'EMERGENCY_LOGIN' || l.action === 'LOGIN_FAILED' || l.action === 'DELETE' ? 'cancelada' : 'activa'}">${escapeHtml(l.action)}</span></td>
          <td>${escapeHtml(l.entity)}</td>
          <td>${escapeHtml(l.entity_id || '—')}</td>
          <td style="max-width:260px;overflow-wrap:anywhere;font-size:0.78rem;color:var(--text-secondary)">${escapeHtml(l.details || '—')}</td>
          <td>${escapeHtml(l.ip || '—')}</td>
        </tr>
      `).join('');
    }
    const countEl = document.getElementById('auditCount');
    if (countEl) countEl.textContent = `${data.pagination.total} evento(s)`;
    renderPagination('auditPagination', data.pagination, loadAuditLogs);
  } catch (err) {
    console.error('Error loading audit logs:', err);
  }
}

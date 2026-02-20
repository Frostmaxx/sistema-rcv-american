// ============================================
// Sistema RCV — Dashboard Logic (dashboard.js)
// ============================================

const API = '';
let currentUser = null;
let searchTimeout = null;

// ── Auth Check ──
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
  
  // Verify token
  apiFetch('/api/auth/me').then(data => {
    if (!data || data.error) {
      logout();
    }
  }).catch(() => logout());

  // Apply custom logo if configured
  if (typeof LOGO !== 'undefined' && LOGO) {
    const el = document.getElementById('sidebarLogoIcon');
    if (el) el.innerHTML = `<img src="${LOGO}" alt="Logo" style="height:50px;width:auto;object-fit:contain">`;
  }

  loadDashboard();
})();

// ── API Helper ──
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
    
    if (res.status === 401 || res.status === 403) {
      logout();
      return null;
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

// ── Navigation ──
function navigateTo(section) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  document.getElementById(`section-${section}`).classList.add('active');
  document.querySelector(`[data-section="${section}"]`).classList.add('active');
  
  // Load data for the section
  if (section === 'dashboard') loadDashboard();
  if (section === 'clients') loadClients();
  if (section === 'policies') loadPolicies();
  if (section === 'coverages') loadCoverages();
  if (section === 'users') loadUsers();
  
  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function logout() {
  localStorage.removeItem('rcv_token');
  localStorage.removeItem('rcv_user');
  window.location.href = '/';
}

// ── Toast ──
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Modal Helpers ──
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Close modal on overlay click (except coverage modal to avoid accidental loss)
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && overlay.id !== 'coverageModal') overlay.classList.remove('active');
  });
});

// ── Confirm Dialog ──
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

// ── Debounced Search ──
function debounceSearch(fn) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(fn, 400);
}

// ── Format Helpers ──
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

// ══════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════
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
    
    // Recent clients
    const clientsList = document.getElementById('recentClientsList');
    if (data.recentClients.length === 0) {
      clientsList.innerHTML = '<div class="table-empty"><div class="empty-icon">📭</div><p>No hay clientes registrados</p></div>';
    } else {
      clientsList.innerHTML = data.recentClients.map(c => `
        <div class="list-item">
          <div class="list-item-icon" style="background:var(--accent-soft);color:var(--accent)">👤</div>
          <div class="list-item-content">
            <div class="title">${c.nombre} ${c.apellido}</div>
            <div class="subtitle">${c.cedula} ${c.ciudad ? '· ' + c.ciudad : ''}</div>
          </div>
        </div>
      `).join('');
    }
    
    // Recent policies
    const policiesList = document.getElementById('recentPoliciesList');
    if (data.recentPolicies.length === 0) {
      policiesList.innerHTML = '<div class="table-empty"><div class="empty-icon">📭</div><p>No hay pólizas creadas</p></div>';
    } else {
      policiesList.innerHTML = data.recentPolicies.map(p => `
        <div class="list-item">
          <div class="list-item-icon" style="background:var(--success-soft);color:var(--success)">📋</div>
          <div class="list-item-content">
            <div class="title">${p.policy_number}</div>
            <div class="subtitle">${p.client_name} · ${vehicleLabel(p.tipo_vehiculo)} · ${p.placa}</div>
          </div>
          ${statusBadge(p.estado)}
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

// ══════════════════════════════════════
// CLIENTS
// ══════════════════════════════════════
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
          <td><strong>${c.cedula}</strong></td>
          <td>${c.nombre} ${c.apellido}</td>
          <td>${c.telefono || '—'}</td>
          <td>${c.email || '—'}</td>
          <td>${c.ciudad || '—'}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editClient(${c.id})">✏️</button>
              <button class="btn btn-sm btn-danger btn-icon" title="Eliminar" onclick="deleteClient(${c.id}, '${c.nombre} ${c.apellido}')">🗑️</button>
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

function openClientModal(client = null) {
  document.getElementById('clientForm').reset();
  document.getElementById('clientId').value = '';
  document.getElementById('clientModalTitle').textContent = client ? 'Editar Cliente' : 'Nuevo Cliente';
  
  if (client) {
    document.getElementById('clientId').value = client.id;
    document.getElementById('clientCedula').value = client.cedula;
    document.getElementById('clientNombre').value = client.nombre;
    document.getElementById('clientApellido').value = client.apellido;
    document.getElementById('clientTelefono').value = client.telefono || '';
    document.getElementById('clientEmail').value = client.email || '';
    document.getElementById('clientDireccion').value = client.direccion || '';
    document.getElementById('clientCiudad').value = client.ciudad || '';
    document.getElementById('clientEstado').value = client.estado_region || '';
    document.getElementById('clientFechaNac').value = client.fecha_nacimiento || '';
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
  const body = {
    cedula: document.getElementById('clientCedula').value,
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
        loadClients(clientsPage);
      } catch (err) {
        console.error('Error deleting client:', err);
      }
    }
  );
}

// ══════════════════════════════════════
// POLICIES
// ══════════════════════════════════════
let policiesPage = 1;

async function loadPolicies(page = 1) {
  policiesPage = page;
  const search = document.getElementById('policySearch')?.value || '';
  const estado = document.getElementById('policyStatusFilter')?.value || '';
  
  try {
    const data = await apiFetch(`/api/policies?page=${page}&limit=15&search=${encodeURIComponent(search)}&estado=${estado}`);
    const tbody = document.getElementById('policiesTableBody');
    
    if (data.policies.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="table-empty"><div class="empty-icon">📋</div><p>No se encontraron pólizas</p></div></td></tr>';
    } else {
      tbody.innerHTML = data.policies.map(p => {
        // Check if policy expires within 15 days
        const now = new Date();
        const expDate = new Date(p.fecha_fin);
        const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
        const expiring = p.estado === 'activa' && daysLeft >= 0 && daysLeft <= 15;
        const expiringIcon = expiring ? ' <span title="Póliza próxima a vencer, contacte al cliente" style="cursor:help;font-size:1.1em;animation:pulse 1.5s infinite">⚠️</span>' : '';

        return `
        <tr${expiring ? ' style="background:rgba(255,165,0,0.07)"' : ''}>
          <td><strong>${p.policy_number}</strong></td>
          <td>${p.client_name}</td>
          <td>${vehicleLabel(p.tipo_vehiculo)} ${p.marca} ${p.modelo}</td>
          <td>${p.placa}</td>
          <td>${coverageLabel(p.cobertura)}</td>
          <td>${formatCurrency(p.prima)}</td>
          <td>${statusBadge(p.estado)}${expiringIcon}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-sm btn-secondary btn-icon" title="Imprimir Carta" onclick="printPolicy(${p.id}, 'carta')">📄</button>
              <button class="btn btn-sm btn-primary btn-icon" title="Renovar" onclick="renewPolicy(${p.id}, '${p.policy_number}')">🔄</button>
              <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editPolicy(${p.id})">✏️</button>
              <button class="btn btn-sm btn-danger btn-icon" title="Eliminar" onclick="deletePolicy(${p.id}, '${p.policy_number}')">🗑️</button>
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

async function openPolicyModal(policy = null) {
  document.getElementById('policyForm').reset();
  document.getElementById('policyId').value = '';
  document.getElementById('policyModalTitle').textContent = policy ? 'Editar Póliza' : 'Nueva Póliza';
  
  // Load clients for dropdown
  try {
    const data = await apiFetch('/api/clients?limit=1000');
    const select = document.getElementById('policyClient');
    select.innerHTML = '<option value="">Seleccione un cliente</option>';
    data.clients.forEach(c => {
      select.innerHTML += `<option value="${c.id}">${c.cedula} — ${c.nombre} ${c.apellido}</option>`;
    });
  } catch (err) {
    console.error('Error loading clients for policy:', err);
  }

  // Load coverages for dropdown
  try {
    const covData = await apiFetch('/api/coverages');
    const covSelect = document.getElementById('policyCobertura');
    covSelect.innerHTML = '<option value="">Seleccione cobertura</option>';
    covData.coverages.forEach(c => {
      covSelect.innerHTML += `<option value="${c.nombre}">${c.nombre}${c.descripcion ? ' — ' + c.descripcion : ''}</option>`;
    });
  } catch (err) {
    console.error('Error loading coverages for policy:', err);
  }
  
  // Set default dates
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
    document.getElementById('policyFechaInicio').value = policy.fecha_inicio;
    document.getElementById('policyFechaFin').value = policy.fecha_fin;
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
    // Update only editable fields
    const body = {
      estado: 'activa',
      cobertura: document.getElementById('policyCobertura').value,
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

// ══════════════════════════════════════
// COVERAGES
// ══════════════════════════════════════
async function loadCoverages() {
  try {
    const data = await apiFetch('/api/coverages?all=1');
    const tbody = document.getElementById('coveragesTableBody');

    if (data.coverages.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="table-empty"><div class="empty-icon">🛡️</div><p>No hay coberturas configuradas</p></div></td></tr>';
    } else {
      tbody.innerHTML = data.coverages.map(c => {
        // Count and sum coverage items
        let itemCount = 0, totalMonto = 0;
        for (let i = 1; i <= 10; i++) {
          if (c[`cob_${i}_nombre`]) { itemCount++; totalMonto += c[`cob_${i}_monto`] || 0; }
        }
        return `
        <tr style="${!c.active ? 'opacity:0.5' : ''}">
          <td><strong>${c.nombre}</strong></td>
          <td>${c.descripcion || '—'}</td>
          <td>${formatCurrency(c.prima)}</td>
          <td>${formatCurrency(totalMonto)}</td>
          <td>${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
          <td>${c.active ? '<span class="badge badge-activa">Activa</span>' : '<span class="badge badge-cancelada">Inactiva</span>'}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editCoverage(${c.id})">✏️</button>
              <button class="btn btn-sm btn-secondary btn-icon" title="${c.active ? 'Desactivar' : 'Activar'}" onclick="toggleCoverage(${c.id}, ${c.active})">${c.active ? '⏸' : '▶️'}</button>
              <button class="btn btn-sm btn-danger btn-icon" title="Eliminar" onclick="deleteCoverage(${c.id}, '${c.nombre}')"> 🗑️</button>
            </div>
          </td>
        </tr>
      `}).join('');
    }
  } catch (err) {
    console.error('Error loading coverages:', err);
  }
}

// Generate the 10 coverage item rows in the modal
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
          <input type="text" id="cob${i}Nombre" class="form-control" placeholder="Cobertura ${i}" value="${nameVal}" style="font-size:0.85rem">
        </div>
        <div class="form-group" style="flex:1">
          ${i === 1 ? '<label style="font-size:0.7rem;color:var(--text-muted,#888)">Monto ($)</label>' : ''}
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

  // Collect 10 coverage items
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
        loadCoverages();
      } catch (err) {
        console.error('Error deleting coverage:', err);
      }
    }
  );
}

// ══════════════════════════════════════
// USERS
// ══════════════════════════════════════
async function loadUsers() {
  try {
    const data = await apiFetch('/api/users');
    const tbody = document.getElementById('usersTableBody');
    
    if (data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="table-empty"><div class="empty-icon">⚙️</div><p>No hay usuarios registrados</p></div></td></tr>';
    } else {
      tbody.innerHTML = data.users.map(u => `
        <tr>
          <td><strong>${u.username}</strong></td>
          <td>${u.email}</td>
          <td>${roleBadge(u.role)}</td>
          <td>${u.active ? '<span class="badge badge-activa">Activo</span>' : '<span class="badge badge-cancelada">Inactivo</span>'}</td>
          <td>${formatDate(u.created_at)}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-sm btn-secondary btn-icon" title="Editar" onclick="editUser(${u.id})">✏️</button>
              ${u.id !== currentUser.id ? `<button class="btn btn-sm btn-danger btn-icon" title="Eliminar" onclick="deleteUser(${u.id}, '${u.username}')">🗑️</button>` : ''}
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

// NUEVA FUNCIÓN: Prepara el modal para crear o editar
function openUserModal(user = null) {
  document.getElementById('userForm').reset();
  document.getElementById('userId').value = '';
  
  if (user) {
    document.getElementById('userId').value = user.id;
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userEmailField').value = user.email;
    document.getElementById('userRoleField').value = user.role;
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
    
    // Llamamos a la función centralizada
    openUserModal(user);
  } catch (err) {
    console.error('Error fetching user:', err);
  }
}

async function saveUser(e) {
  e.preventDefault();
  const id = document.getElementById('userId').value;
  const body = {
    username: document.getElementById('userUsername').value,
    email: document.getElementById('userEmailField').value,
    role: document.getElementById('userRoleField').value
  };
  
  const password = document.getElementById('userPassword').value;
  if (password) body.password = password;

  // Validación: Si no hay ID (es creación) y no hay password, bloqueamos
  if (!id && !password) {
    showToast('La contraseña es obligatoria para un usuario nuevo.', 'warning');
    return;
  }
  
  try {
    if (id) {
      // Flujo de EDICIÓN (PUT)
      await apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Usuario actualizado exitosamente', 'success');
      
      // Si se edita a sí mismo, actualizar el UI
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
      // Flujo de CREACIÓN (POST)
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

// ══════════════════════════════════════
// PAGINATION
// ══════════════════════════════════════
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

// ══════════════════════════════════════
// PRINT POLICY
// ══════════════════════════════════════
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
        loadPolicies();
      } catch (err) {
        console.error('Error renewing policy:', err);
      }
    }
  );
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    closeConfirm();
  }
});

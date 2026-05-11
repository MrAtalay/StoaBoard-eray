// API client + DATA bootstrap

const TR_MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

function fmtDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
}

function isOverdue(isoDate, colId) {
  if (!isoDate) return false;
  const col = (window.DATA?.COLUMNS || []).find(c => c.id === colId);
  if (col?.is_done) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(isoDate) < today;
}

// ── API client ──────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const opts = {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  };
  if (opts.body && typeof opts.body === 'object') {
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

window.API = {
  // Auth
  me:       ()              => apiFetch('/api/auth/me'),
  login:    (email, pw)     => apiFetch('/api/auth/login',    { method: 'POST', body: { email, password: pw } }),
  register: (name, email, pw) => apiFetch('/api/auth/register', { method: 'POST', body: { name, email, password: pw } }),
  logout:   ()              => apiFetch('/api/auth/logout',   { method: 'POST' }),
  sendPasswordReset: (_email)         => Promise.resolve(),
  resetPassword:     (_email, _pass)  => Promise.resolve(),
  oauthLogin:        (provider)       => Promise.reject(new Error(`${provider} ile giriş henüz desteklenmiyor`)),

  // Bootstrap (all data for current project)
  bootstrap: (projectId) =>
    apiFetch(projectId ? `/api/bootstrap?project=${projectId}` : '/api/bootstrap'),

  // Tasks
  createTask: (projectId, data) =>
    apiFetch(`/api/projects/${projectId}/tasks`, { method: 'POST', body: data }),
  updateTask: (id, data) =>
    apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: data }),
  deleteTask: (id) =>
    apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }),
  getTaskDetail: (id) =>
    apiFetch(`/api/tasks/${id}`),

  // Subtasks
  addSubtask:    (taskId, title) =>
    apiFetch(`/api/tasks/${taskId}/subtasks`, { method: 'POST', body: { title } }),
  toggleSubtask: (id, done) =>
    apiFetch(`/api/subtasks/${id}`, { method: 'PATCH', body: { done } }),
  deleteSubtask: (id) =>
    apiFetch(`/api/subtasks/${id}`, { method: 'DELETE' }),

  // Comments
  addComment: (taskId, text) =>
    apiFetch(`/api/tasks/${taskId}/comments`, { method: 'POST', body: { text } }),
  deleteComment: (id) =>
    apiFetch(`/api/comments/${id}`, { method: 'DELETE' }),

  // Notifications
  getNotifications: () => apiFetch('/api/notifications'),
  createNotification: (text, userId) => apiFetch('/api/notifications', { method: 'POST', body: { text, user_id: userId } }),
  markRead:         (id) => apiFetch(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllRead:      ()   => apiFetch('/api/notifications/read-all',   { method: 'POST' }),
  deleteNotif:      (id) => apiFetch(`/api/notifications/${id}`,      { method: 'DELETE' }),

  // Profile
  updateProfile: (data) => apiFetch('/api/users/me', { method: 'PUT', body: data }),
  deleteAccount: (email) => apiFetch('/api/users/me', { method: 'DELETE', body: { email } }),
  uploadAvatar: (formData) => fetch('/api/users/me/avatar', {
    method: 'POST', credentials: 'same-origin', body: formData,
  }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || 'Yükleme başarısız')))),
  deleteAvatar: () => apiFetch('/api/users/me/avatar', { method: 'DELETE' }),

  // Projects
  getProjects:   ()          => apiFetch('/api/projects'),
  createProject: (data)      => apiFetch('/api/projects', { method: 'POST', body: data }),
  updateProject: (id, data)  => apiFetch(`/api/projects/${id}`, { method: 'PATCH', body: data }),
  deleteProject: (id)        => apiFetch(`/api/projects/${id}`, { method: 'DELETE' }),

  // Labels
  createLabel: (projectId, data) =>
    apiFetch(`/api/projects/${projectId}/labels`, { method: 'POST', body: data }),
  updateLabel: (projectId, slug, data) =>
    apiFetch(`/api/projects/${projectId}/labels/${slug}`, { method: 'PATCH', body: data }),
  deleteLabel: (projectId, slug) =>
    apiFetch(`/api/projects/${projectId}/labels/${slug}`, { method: 'DELETE' }),

  // Columns
  createColumn: (projectId, data) =>
    apiFetch(`/api/projects/${projectId}/columns`, { method: 'POST', body: data }),
  updateColumn: (id, data) =>
    apiFetch(`/api/columns/${id}`, { method: 'PATCH', body: data }),
  deleteColumn: (id) =>
    apiFetch(`/api/columns/${id}`, { method: 'DELETE' }),

  // Chat
  getChatMessages: (withSlug) =>
    apiFetch(withSlug ? `/api/chat/messages?with=${withSlug}` : '/api/chat/messages'),
  sendChatMessage: (data) =>
    apiFetch('/api/chat/messages', { method: 'POST', body: data }),
  deleteChatMessage: (id, scope) =>
    apiFetch(`/api/chat/messages/${id}`, { method: 'DELETE', body: { scope } }),
  getChatMedia: (type) => apiFetch('/api/chat/media' + (type ? '?type=' + type : '')),

  // Workspace setup & switching
  createWorkspace:   (data)  => apiFetch('/api/workspaces',              { method: 'POST', body: data }),
  joinWorkspace:     (code)  => apiFetch('/api/workspaces/join',          { method: 'POST', body: { code } }),
  myWorkspaces:      ()      => apiFetch('/api/workspaces/mine'),
  switchWorkspace:   (wsId)  => apiFetch(`/api/workspaces/${wsId}/switch`, { method: 'POST' }),

  // User preferences
  updatePreferences: (data)  => apiFetch('/api/me/preferences', { method: 'PATCH', body: data }),

  // Invite code
  regenInviteCode:  () => apiFetch('/api/workspaces/me/regen-code',  { method: 'POST' }),
  deleteInviteCode: () => apiFetch('/api/workspaces/me/invite-code', { method: 'DELETE' }),

  // Roles
  getRoles:   ()         => apiFetch('/api/workspaces/me/roles'),
  createRole: (data)     => apiFetch('/api/workspaces/me/roles',    { method: 'POST',  body: data }),
  updateRole: (id, data) => apiFetch(`/api/workspaces/roles/${id}`, { method: 'PATCH', body: data }),
  deleteRole: (id)       => apiFetch(`/api/workspaces/roles/${id}`, { method: 'DELETE' }),

  // Members
  updateMember: (slug, data) => apiFetch(`/api/workspaces/members/${slug}`, { method: 'PATCH',  body: data }),
  removeMember: (slug)       => apiFetch(`/api/workspaces/members/${slug}`, { method: 'DELETE' }),

  // Join requests (owner actions)
  getJoinRequests:    ()    => apiFetch('/api/workspaces/me/join-requests'),
  approveJoinRequest: (id)  => apiFetch(`/api/workspaces/join-requests/${id}/approve`, { method: 'POST' }),
  rejectJoinRequest:  (id)  => apiFetch(`/api/workspaces/join-requests/${id}/reject`,  { method: 'POST' }),

  // Workspace logo
  uploadWorkspaceLogo: (wsId, formData) => {
    return fetch(`/api/workspaces/${wsId}/logo`, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || 'Yükleme başarısız'))));
  },
  deleteWorkspaceLogo: (wsId) => apiFetch(`/api/workspaces/${wsId}/logo`, { method: 'DELETE' }),
};

// ── Static palette commands ─────────────────────────────────────────────────

const COMMANDS = [
  { group: 'Navigasyon', items: [
    { label: 'Board\'a git',          icon: 'layoutBoard', action: 'goto:board',     shortcut: 'G B' },
    { label: 'Liste görünümü',        icon: 'list',        action: 'goto:list',      shortcut: 'G L' },
    { label: 'Takvim',                icon: 'calendar',    action: 'goto:calendar',  shortcut: 'G C' },
    { label: 'Dashboard',             icon: 'chart',       action: 'goto:dashboard', shortcut: 'G D' },
    { label: 'Ayarlar',               icon: 'settings',    action: 'goto:settings',  shortcut: 'G S' },
  ]},
  { group: 'Aksiyonlar', items: [
    { label: 'Yeni görev',            icon: 'plus',        action: 'new:task',       shortcut: 'N' },
    { label: 'Bildirimleri aç',       icon: 'bell',        action: 'open:notifs' },
    { label: 'Sohbeti aç',            icon: 'msg',         action: 'open:chat' },
    { label: 'Yeni proje',            icon: 'plus',        action: 'new:project' },
  ]},
  { group: 'Görünüm', items: [
    { label: 'Temayı değiştir',       icon: 'sparkle',     action: 'toggle:theme' },
    { label: 'Kenar çubuğunu daralt', icon: 'sidebarIn',   action: 'toggle:sidebar' },
  ]},
  { group: 'Takım', items: [
    { label: 'Çıkış yap',             icon: 'logOut',      action: 'logout' },
  ]},
];

// ── Global DATA object (populated from API on login) ────────────────────────

window.DATA = {
  MEMBERS: [],
  LABELS: {},
  COLUMNS: [],
  TASKS: [],
  NOTIFICATIONS: [],
  ACTIVITY: [],
  THROUGHPUT: [],
  PROJECTS: [],
  WORKSPACE: {},
  WORKSPACES: [],
  COMMANDS,
  fmtDate,
  isOverdue,
  TR_MONTHS,
};

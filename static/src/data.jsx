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
  sendPasswordReset: (email)                => apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword:     (email, password, code) => apiFetch('/api/auth/reset-password',  { method: 'POST', body: { email, password, code } }),
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
  getChatMessages: (withSlug, channel) => {
    if (withSlug) return apiFetch(`/api/chat/messages?with=${withSlug}`);
    const ch = channel || 'general';
    return apiFetch(`/api/chat/messages?channel=${encodeURIComponent(ch)}`);
  },
  sendChatMessage: (data) =>
    apiFetch('/api/chat/messages', { method: 'POST', body: data }),
  deleteChatMessage: (id, scope) =>
    apiFetch(`/api/chat/messages/${id}`, { method: 'DELETE', body: { scope } }),
  getChatMedia: (type) => apiFetch('/api/chat/media' + (type ? '?type=' + type : '')),
  togglePinMessage: (id) =>
    apiFetch(`/api/chat/messages/${id}/pin`, { method: 'POST' }),
  getPinnedMessages: (withSlug, channel) => {
    if (withSlug) return apiFetch(`/api/chat/pinned?with=${withSlug}`);
    const ch = channel || 'general';
    return apiFetch(`/api/chat/pinned?channel=${encodeURIComponent(ch)}`);
  },

  // Channels (membership-aware)
  listChannels:            ()                          => apiFetch('/api/channels'),
  createChannel:           (data)                      => apiFetch('/api/channels', { method: 'POST', body: data }),
  getChannel:              (channelId)                 => apiFetch(`/api/channels/${channelId}`),
  updateChannel:           (channelId, data)           => apiFetch(`/api/channels/${channelId}`, { method: 'PATCH', body: data }),
  deleteChannel:           (channelId)                 => apiFetch(`/api/channels/${channelId}`, { method: 'DELETE' }),
  addChannelMembers:       (channelId, memberSlugs)    => apiFetch(`/api/channels/${channelId}/members`, { method: 'POST', body: { member_slugs: memberSlugs } }),
  removeChannelMember:     (channelId, userSlug)       => apiFetch(`/api/channels/${channelId}/members/${userSlug}`, { method: 'DELETE' }),
  updateChannelMemberRole: (channelId, userSlug, role) => apiFetch(`/api/channels/${channelId}/members/${userSlug}`, { method: 'PATCH', body: { role } }),

  // Notes
  listNotes:     (opts)      => apiFetch('/api/notes' + ((opts && opts.archived) ? '?archived=1' : '')),
  notesCount:    ()          => apiFetch('/api/notes/count'),
  getNote:       (id)        => apiFetch(`/api/notes/${id}`),
  createNote:    (data)      => apiFetch('/api/notes',         { method: 'POST',   body: data }),
  updateNote:    (id, data)  => apiFetch(`/api/notes/${id}`,   { method: 'PATCH',  body: data }),
  deleteNote:    (id)        => apiFetch(`/api/notes/${id}`,   { method: 'DELETE' }),
  linkNoteTask:   (noteId, taskId) => apiFetch(`/api/notes/${noteId}/link-task`, { method: 'POST', body: { task_id: taskId } }),
  unlinkNoteTask: (noteId, taskId) => apiFetch(`/api/notes/${noteId}/link-task/${taskId}`, { method: 'DELETE' }),
  taskLinkedNotes: (taskId)        => apiFetch(`/api/tasks/${taskId}/linked-notes`),
  workspaceTasks:  ()              => apiFetch('/api/workspaces/me/tasks'),

  // Workspace setup & switching
  createWorkspace:   (data)  => apiFetch('/api/workspaces',              { method: 'POST', body: data }),
  joinWorkspace:     (code)  => apiFetch('/api/workspaces/join',          { method: 'POST', body: { code } }),
  myWorkspaces:      ()      => apiFetch('/api/workspaces/mine'),
  switchWorkspace:   (wsId)  => apiFetch(`/api/workspaces/${wsId}/switch`, { method: 'POST' }),
  updateWorkspace:   (wsId, data) => apiFetch(`/api/workspaces/${wsId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // User preferences
  updatePreferences: (data)  => apiFetch('/api/me/preferences', { method: 'PATCH', body: data }),

  // Columns
  reorderColumns: (projectId, columnIds) => apiFetch(`/api/projects/${projectId}/columns/reorder`, { method: 'POST', body: JSON.stringify({ column_ids: columnIds }) }),

  // Invite code
  transferOwnership: (toSlug) => apiFetch('/api/workspaces/me/transfer-ownership', { method: 'POST', body: { to_slug: toSlug } }),
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

// ── App-wide i18n ────────────────────────────────────────────────────────────

window.APP_I18N = {
  tr: {
    nav_home:'Ana Sayfa', nav_tasks:'Görevlerim', nav_board:'Pano', nav_calendar:'Takvim',
    nav_chat:'Sohbet', nav_notes:'Notlar', nav_notifications:'Bildirimler', nav_settings:'Ayarlar',
    nav_projects:'Projeler', nav_dms:'Direkt Mesajlar',
    nav_no_projects:'Henüz proje yok', nav_no_members:'Henüz başka üye yok',
    nav_new_project:'Yeni proje',
    topbar_new_task:'+ Yeni görev', topbar_quick_chat:'Hızlı Sohbet',
    topbar_chat_open:'Sohbet zaten tam ekran açık', topbar_notifications:'Bildirimler',
    crumb_board:'Pano', crumb_list:'Liste', crumb_calendar:'Takvim', crumb_chat:'Sohbet',
    crumb_notes:'Notlar', crumb_settings:'Ayarlar', crumb_tasks:'Görevlerim',
    crumb_notifications:'Bildirimler', crumb_dashboard:'Ana Sayfa',
    set_title:'Ayarlar', set_subtitle:'Hesap & çalışma alanı',
    set_profile:'Profil', set_appearance:'Görünüm', set_workspace:'Çalışma Alanı',
    set_invite:'Davet Kodu', set_roles:'Roller', set_members:'Üyeler', set_labels:'Etiketler',
    set_notifications:'Bildirimler', set_shortcuts:'Kısayollar', set_privacy:'Gizlilik',
    set_language:'Dil & Bölge', set_export:'Veri & Dışa Aktarma', set_danger:'Tehlikeli Bölge',
  },
  en: {
    nav_home:'Home', nav_tasks:'My Tasks', nav_board:'Board', nav_calendar:'Calendar',
    nav_chat:'Chat', nav_notes:'Notes', nav_notifications:'Notifications', nav_settings:'Settings',
    nav_projects:'Projects', nav_dms:'Direct Messages',
    nav_no_projects:'No projects yet', nav_no_members:'No other members yet',
    nav_new_project:'New project',
    topbar_new_task:'+ New task', topbar_quick_chat:'Quick Chat',
    topbar_chat_open:'Chat is already open full-screen', topbar_notifications:'Notifications',
    crumb_board:'Board', crumb_list:'List', crumb_calendar:'Calendar', crumb_chat:'Chat',
    crumb_notes:'Notes', crumb_settings:'Settings', crumb_tasks:'My Tasks',
    crumb_notifications:'Notifications', crumb_dashboard:'Home',
    set_title:'Settings', set_subtitle:'Account & workspace',
    set_profile:'Profile', set_appearance:'Appearance', set_workspace:'Workspace',
    set_invite:'Invite Code', set_roles:'Roles', set_members:'Members', set_labels:'Labels',
    set_notifications:'Notifications', set_shortcuts:'Shortcuts', set_privacy:'Privacy',
    set_language:'Language & Region', set_export:'Data & Export', set_danger:'Danger Zone',
  },
  de: {
    nav_home:'Startseite', nav_tasks:'Meine Aufgaben', nav_board:'Board', nav_calendar:'Kalender',
    nav_chat:'Chat', nav_notes:'Notizen', nav_notifications:'Benachrichtigungen', nav_settings:'Einstellungen',
    nav_projects:'Projekte', nav_dms:'Direktnachrichten',
    nav_no_projects:'Noch keine Projekte', nav_no_members:'Noch keine anderen Mitglieder',
    nav_new_project:'Neues Projekt',
    topbar_new_task:'+ Neue Aufgabe', topbar_quick_chat:'Schnell-Chat',
    topbar_chat_open:'Chat ist bereits im Vollbildmodus geöffnet', topbar_notifications:'Benachrichtigungen',
    crumb_board:'Board', crumb_list:'Liste', crumb_calendar:'Kalender', crumb_chat:'Chat',
    crumb_notes:'Notizen', crumb_settings:'Einstellungen', crumb_tasks:'Meine Aufgaben',
    crumb_notifications:'Benachrichtigungen', crumb_dashboard:'Startseite',
    set_title:'Einstellungen', set_subtitle:'Konto & Arbeitsbereich',
    set_profile:'Profil', set_appearance:'Erscheinungsbild', set_workspace:'Arbeitsbereich',
    set_invite:'Einladungscode', set_roles:'Rollen', set_members:'Mitglieder', set_labels:'Etiketten',
    set_notifications:'Benachrichtigungen', set_shortcuts:'Tastenkürzel', set_privacy:'Datenschutz',
    set_language:'Sprache & Region', set_export:'Daten & Export', set_danger:'Gefahrenzone',
  },
  es: {
    nav_home:'Inicio', nav_tasks:'Mis Tareas', nav_board:'Tablero', nav_calendar:'Calendario',
    nav_chat:'Chat', nav_notes:'Notas', nav_notifications:'Notificaciones', nav_settings:'Configuración',
    nav_projects:'Proyectos', nav_dms:'Mensajes Directos',
    nav_no_projects:'Aún no hay proyectos', nav_no_members:'Aún no hay otros miembros',
    nav_new_project:'Nuevo proyecto',
    topbar_new_task:'+ Nueva tarea', topbar_quick_chat:'Chat rápido',
    topbar_chat_open:'El chat ya está abierto en pantalla completa', topbar_notifications:'Notificaciones',
    crumb_board:'Tablero', crumb_list:'Lista', crumb_calendar:'Calendario', crumb_chat:'Chat',
    crumb_notes:'Notas', crumb_settings:'Configuración', crumb_tasks:'Mis Tareas',
    crumb_notifications:'Notificaciones', crumb_dashboard:'Inicio',
    set_title:'Configuración', set_subtitle:'Cuenta y área de trabajo',
    set_profile:'Perfil', set_appearance:'Apariencia', set_workspace:'Área de Trabajo',
    set_invite:'Código de Invitación', set_roles:'Roles', set_members:'Miembros', set_labels:'Etiquetas',
    set_notifications:'Notificaciones', set_shortcuts:'Atajos', set_privacy:'Privacidad',
    set_language:'Idioma y Región', set_export:'Datos y Exportación', set_danger:'Zona de Peligro',
  },
  ru: {
    nav_home:'Главная', nav_tasks:'Мои задачи', nav_board:'Доска', nav_calendar:'Календарь',
    nav_chat:'Чат', nav_notes:'Заметки', nav_notifications:'Уведомления', nav_settings:'Настройки',
    nav_projects:'Проекты', nav_dms:'Личные сообщения',
    nav_no_projects:'Пока нет проектов', nav_no_members:'Пока нет других участников',
    nav_new_project:'Новый проект',
    topbar_new_task:'+ Новая задача', topbar_quick_chat:'Быстрый чат',
    topbar_chat_open:'Чат уже открыт в полноэкранном режиме', topbar_notifications:'Уведомления',
    crumb_board:'Доска', crumb_list:'Список', crumb_calendar:'Календарь', crumb_chat:'Чат',
    crumb_notes:'Заметки', crumb_settings:'Настройки', crumb_tasks:'Мои задачи',
    crumb_notifications:'Уведомления', crumb_dashboard:'Главная',
    set_title:'Настройки', set_subtitle:'Аккаунт и рабочее пространство',
    set_profile:'Профиль', set_appearance:'Внешний вид', set_workspace:'Рабочее пространство',
    set_invite:'Код приглашения', set_roles:'Роли', set_members:'Участники', set_labels:'Метки',
    set_notifications:'Уведомления', set_shortcuts:'Горячие клавиши', set_privacy:'Конфиденциальность',
    set_language:'Язык и Регион', set_export:'Данные и Экспорт', set_danger:'Опасная зона',
  },
};

// ── Static palette commands ─────────────────────────────────────────────────

const COMMANDS = [
  { group: 'Navigasyon', items: [
    { label: 'Ana Sayfa',             icon: 'home',        action: 'goto:dashboard', shortcut: 'G D' },
    { label: 'Pano (Kanban)',         icon: 'layoutBoard', action: 'goto:board',     shortcut: 'G B' },
    { label: 'Liste görünümü',        icon: 'list',        action: 'goto:board-list', shortcut: 'G L' },
    { label: 'Takvim',                icon: 'calendar',    action: 'goto:calendar',  shortcut: 'G C' },
    { label: 'Sohbet',                icon: 'msg',         action: 'goto:chat',      shortcut: 'G M' },
    { label: 'Notlar',                icon: 'note',        action: 'goto:notes',     shortcut: 'G N' },
    { label: 'Ayarlar',               icon: 'settings',    action: 'goto:settings',  shortcut: 'G S' },
  ]},
  { group: 'Aksiyonlar', items: [
    { label: 'Yeni görev',            icon: 'plus',        action: 'new:task',       shortcut: 'N' },
    { label: 'Yeni not',              icon: 'plus',        action: 'new:note' },
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
  NOTES: [],
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

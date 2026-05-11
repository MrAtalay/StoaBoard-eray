// Main app — API-backed with real-time chat

const { useState: useS, useEffect: useEf, useRef: useRef } = React;

function _playDing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx  = new Ctx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.28);
    osc.onended = () => ctx.close();
  } catch (e) {}
}

function App() {
  const [authed, setAuthed]                 = useS(false);
  const [loading, setLoading]               = useS(true);
  const [needsWorkspace, setNeedsWorkspace] = useS(false);
  const [view, setView]                     = useS(() => localStorage.getItem('stoa.view') || 'board');
  const [tasks, setTasks]                   = useS([]);
  const [currentProject, setCurrentProject] = useS(null);
  const [drawerTask, setDrawerTask]         = useS(null);
  const [modalOpen, setModalOpen]           = useS(false);
  const [modalCol, setModalCol]             = useS('todo');
  const [modalInitialDates, setModalInitialDates] = useS(null);
  const [cmdOpen, setCmdOpen]               = useS(false);
  const [notifOpen, setNotifOpen]           = useS(false);
  const [chatOpen, setChatOpen]             = useS(false);
  const [chatDmWith, setChatDmWith]         = useS(null);
  const [onlineUsers, setOnlineUsers]       = useS(new Map()); // slug → status
  const [members, setMembers]               = useS([]);
  const [isOwner, setIsOwner]               = useS(false);
  const [projectModal, setProjectModal]     = useS(false);
  const [tweaksAvailable, setTweaksAvailable] = useS(false);
  const [socket, setSocket]                 = useS(null);
  const [workspaces, setWorkspaces]         = useS([]);
  const [wsSwitcherOpen, setWsSwitcherOpen] = useS(false);
  const [wsJoinModalOpen, setWsJoinModalOpen] = useS(false);
  const [wsLogoUrl, setWsLogoUrl]           = useS(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useS(false);
  const [projectSwitching, setProjectSwitching]   = useS(false);
  const switchAbortRef = useRef(null);

  const activityTimer  = useRef(null);
  const currentStatus  = useRef('online');
  const autoAwayStatus = useRef(false);
  const manualAwayStatus = useRef(false);
  const pendingGTimer  = useRef(null);
  const [myStatusState, setMyStatusState] = useS('online');
  const [notifCount, setNotifCount]       = useS(0);
  const [currentWsId, setCurrentWsId]   = useS(() => window.DATA?.WORKSPACE?.id || null);

  const [unreadCounts, setUnreadCounts] = useS(() => {
    try { return JSON.parse(localStorage.getItem('stoa.unread') || '{}'); }
    catch { return {}; }
  });

  const [tweaks, setTweaks] = useS(() => {
    const saved = localStorage.getItem('stoa.tweaks');
    const initial = saved ? JSON.parse(saved) : (window.__TWEAKS__ || {});
    return initial.fontPair === 'instrument' ? { ...initial, fontPair: 'sans' } : initial;
  });

  const setTweak = (key, value) => {
    const next = { ...tweaks, [key]: value };
    setTweaks(next);
    localStorage.setItem('stoa.tweaks', JSON.stringify(next));
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: value } }, '*'); } catch (e) {}
  };

  const myMember = members.find(m => m.id === window.CURRENT_USER?.id) || {};
  const myPerms = myMember.role_permissions || [];
  const canManageTasks = isOwner || myPerms.includes('manage_tasks');
  const canManageProjects = isOwner || myPerms.includes('manage_projects');

  useEf(() => localStorage.setItem('stoa.view', view), [view]);
  useEf(() => { document.documentElement.dataset.theme    = tweaks.theme;    }, [tweaks.theme]);
  useEf(() => { document.documentElement.dataset.accent   = tweaks.accent;   }, [tweaks.accent]);
  useEf(() => { document.documentElement.dataset.fontpair = tweaks.fontPair; }, [tweaks.fontPair]);
  useEf(() => { document.documentElement.dataset.density  = tweaks.density;  }, [tweaks.density]);

  useEf(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode')        setTweaksAvailable(true);
      else if (e.data?.type === '__deactivate_edit_mode') setTweaksAvailable(false);
    };
    window.addEventListener('message', handler);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}
    return () => window.removeEventListener('message', handler);
  }, []);

  // Keyboard shortcuts
  useEf(() => {
    const isEditing = () => {
      const ae = document.activeElement;
      return ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable;
    };
    const clearG = () => { clearTimeout(pendingGTimer.current); pendingGTimer.current = null; };
    const G_MAP = { b: 'board', l: 'list', c: 'calendar', d: 'dashboard', s: 'settings' };

    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); clearG(); setCmdOpen(true); return; }
      if (e.key === 'Escape') {
        clearG();
        setDrawerTask(null); setModalOpen(false); setCmdOpen(false);
        setNotifOpen(false); setChatOpen(false); setProjectModal(false);
        setWsSwitcherOpen(false);
        return;
      }
      if (isEditing()) return;

      // Second key of a G+key sequence
      if (pendingGTimer.current !== null) {
        clearG();
        const dest = G_MAP[e.key.toLowerCase()];
        if (dest) { e.preventDefault(); setView(dest); }
        return;
      }

      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        pendingGTimer.current = setTimeout(clearG, 600);
        return;
      }

      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        if (canManageTasks) openModal('todo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearG(); };
  }, [canManageTasks]);

  // ── Auth + bootstrap on mount ────────────────────────────────────────────
  useEf(() => {
    API.me()
      .then(() => API.bootstrap())
      .then((data) => {
        if (data.needs_workspace) {
          window.CURRENT_USER = data.user;
          setAuthed(true); setNeedsWorkspace(true); setLoading(false);
          return;
        }
        _applyBootstrap(data);
        setTasks(data.tasks || []);
        setCurrentProject(data.current_project ? { id: data.current_project } : null);
        if (data.online_users) _applyOnlineUsers(data.online_users);
        if (data.workspaces)   setWorkspaces(data.workspaces);
        setAuthed(true); setNeedsWorkspace(false); setLoading(false);
      })
      .catch(() => { setAuthed(false); setLoading(false); });
  }, []);

  // ── Socket.IO connection ─────────────────────────────────────────────────
  useEf(() => {
    if (!authed || needsWorkspace || !window.io) return;
    const sock = window.io({ transports: ['websocket', 'polling'] });
    window.SOCKET = sock;
    setSocket(sock);

    sock.on('online_users', ({ users }) => _applyOnlineUsers(users));
    sock.on('user_online',  ({ user, status }) => setOnlineUsers(prev => {
      const n = new Map(prev); n.set(user, status || 'online'); return n;
    }));
    sock.on('user_offline', ({ user }) => setOnlineUsers(prev => {
      const n = new Map(prev); n.delete(user); return n;
    }));
    sock.on('user_status',  ({ user, status }) => setOnlineUsers(prev => {
      const n = new Map(prev); n.set(user, status); return n;
    }));
    sock.on('member_joined', ({ member }) => {
      setMembers(prev => {
        if (prev.find(m => m.id === member.id)) return prev;
        const next = [...prev, member];
        window.DATA.MEMBERS = next;
        return next;
      });
    });
    sock.on('workspace_switched', ({ workspace_id }) => {
      API.bootstrap().then(data => {
        _applyBootstrap(data);
        setTasks(data.tasks || []);
        setCurrentProject(data.current_project ? { id: data.current_project } : null);
        if (data.workspaces) setWorkspaces(data.workspaces);
      }).catch(() => {});
    });

    // Real-time notifications (from DM / @mention / task assignment)
    sock.on('notification', (notif) => {
      if (!notif) return;
      if (!window.DATA.NOTIFICATIONS) window.DATA.NOTIFICATIONS = [];
      if (!window.DATA.NOTIFICATIONS.some(n => n.id === notif.id)) {
        window.DATA.NOTIFICATIONS.unshift(notif);
        setNotifCount(c => c + 1);
        const twks = JSON.parse(localStorage.getItem('stoa.tweaks') || '{}');
        const myStatus = window.__MY_STATUS__ || 'online';
        if (myStatus !== 'dnd' && twks.soundEnabled !== false) _playDing();
      }
    });

    // Global chat_message handler — unread counts + sound + toast
    if (!window.__TOAST_LAST_MSG__) window.__TOAST_LAST_MSG__ = {};
    sock.on('chat_message', (msg) => {
      const me = window.CURRENT_USER?.id;
      if (!msg || msg.from === me) return;

      const isDM       = !!msg.to;
      const chatIsOpen = window.__CHAT_OPEN__;
      const chatDmWith = window.__CHAT_DM_WITH__;
      const isViewingThis = chatIsOpen && (
        (!isDM && !chatDmWith) ||
        (isDM && chatDmWith === msg.from)
      );

      // Muted check
      const muted = window.__MUTED_USERS__ ||
        new Set(JSON.parse(localStorage.getItem('stoa.muted') || '[]'));
      if (muted.has(msg.from)) return;

      const twks     = JSON.parse(localStorage.getItem('stoa.tweaks') || '{}');
      const myStatus = window.__MY_STATUS__ || 'online';

      // Unread counter — always increment unless currently viewing this conversation
      if (!isViewingThis && window.__INCREMENT_UNREAD__) {
        const wsKey = window.__CURRENT_WS_ID__ ? `general_${window.__CURRENT_WS_ID__}` : 'general';
        window.__INCREMENT_UNREAD__(isDM ? `dm_${msg.from}` : wsKey);
      }

      // Notification sound — not DND, sound enabled, not viewing this conversation
      if (!isViewingThis && myStatus !== 'dnd' && twks.soundEnabled !== false) {
        _playDing();
      }

      // Toast notification
      if (isViewingThis) return;
      if (twks.notifyMessages === false || twks.notifyToasts === false) return;
      if (myStatus === 'dnd') return;
      if (isDM  && twks.notifyDMs       === false) return;
      if (!isDM && twks.notifyGroupChat === false) return;

      const now = Date.now();
      const key = String(msg.from);
      const lastTimes = window.__TOAST_LAST_MSG__;
      if (lastTimes[key] && (now - lastTimes[key]) < 2000) return;
      lastTimes[key] = now;

      if ((window.TOAST_QUEUE || []).length >= 3) return;

      const allMembers = window.DATA?.MEMBERS || [];
      const sender = allMembers.find(m => m.id === msg.from);
      if (sender && window.showToast) {
        window.showToast(messageToastPayload(msg, sender), 'message');
      }
    });

    return () => {
      sock.disconnect();
      window.SOCKET = null;
      setSocket(null);
    };
  }, [authed, needsWorkspace]);

  useEf(() => {
    window.__CHAT_OPEN__    = chatOpen;
    window.__CHAT_DM_WITH__ = chatDmWith;
  }, [chatOpen, chatDmWith]);

  // ── Activity tracking → presence status ─────────────────────────────────
  useEf(() => {
    if (!authed || needsWorkspace) return;

    const getTimeout = () => {
      const user = window.CURRENT_USER;
      return ((user?.away_timeout) || 15) * 60 * 1000;
    };

    const armAwayTimer = () => {
      clearTimeout(activityTimer.current);
      if (currentStatus.current === 'online') {
        activityTimer.current = setTimeout(() => {
          setOwnStatus('away', { auto: true });
        }, getTimeout());
      }
    };

    const resetTimer = () => {
      if (currentStatus.current === 'dnd' || manualAwayStatus.current) return;
      if (currentStatus.current === 'away' && autoAwayStatus.current) {
        setOwnStatus('online');
      }
      armAwayTimer();
    };

    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach(ev => document.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    // Go offline when page is closed/hidden
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(activityTimer.current);
        // Don't emit offline on visibility change — only on actual disconnect
      } else {
        resetTimer();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearTimeout(activityTimer.current);
      events.forEach(ev => document.removeEventListener(ev, resetTimer));
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [authed, needsWorkspace, socket]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  // Expose stable unread increment function via window global (safe in socket handler)
  useEf(() => {
    window.__INCREMENT_UNREAD__ = (key) => {
      setUnreadCounts(prev => {
        const next = { ...prev, [key]: (prev[key] || 0) + 1 };
        localStorage.setItem('stoa.unread', JSON.stringify(next));
        return next;
      });
    };
  }, []); // setUnreadCounts is stable — no deps needed

  const markAsRead = (key) => {
    setUnreadCounts(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      localStorage.setItem('stoa.unread', JSON.stringify(next));
      return next;
    });
  };

  function setOwnStatus(status, options = {}) {
    const normalized = ['online', 'away', 'dnd'].includes(status) ? status : 'online';
    const isManualAway = options.manual && normalized === 'away';
    const isAutoAway = options.auto && normalized === 'away';

    currentStatus.current = normalized;
    autoAwayStatus.current = !!isAutoAway;
    manualAwayStatus.current = !!isManualAway;

    if (normalized === 'online' || normalized === 'dnd') {
      autoAwayStatus.current = false;
      manualAwayStatus.current = false;
    }

    setMyStatusState(normalized);
    window.__MY_STATUS__ = normalized;
    if (window.SOCKET) window.SOCKET.emit('set_status', { status: normalized });
    if (options.persist !== false) {
      API.updatePreferences({ status: normalized }).catch(() => {});
    }
  }

  function messageToastPayload(msg, sender) {
    const MAX_LEN = 80;
    const raw = msg.text || msg.file_name || 'Dosya';
    const truncated = raw.length > MAX_LEN;
    return {
      message: truncated ? raw.slice(0, MAX_LEN) + '…' : raw,
      meta: {
        sender: sender?.name || msg.from || 'Yeni mesaj',
        senderId: sender?.id || msg.from,
        channel: msg.to ? 'Direkt mesaj' : 'Genel kanal',
        time: msg.time || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        truncated,
        dmWith: msg.to ? (typeof msg.from === 'string' ? msg.from : null) : null,
      },
    };
  }

  function _applyOnlineUsers(users) {
    // users is array of {slug, status} objects
    const map = new Map();
    if (Array.isArray(users)) {
      users.forEach(u => {
        if (typeof u === 'string') map.set(u, 'online');
        else if (u.slug) map.set(u.slug, u.status || 'online');
      });
    }
    setOnlineUsers(map);
  }

  function _applyBootstrap(data) {
    window.DATA.MEMBERS       = data.members       || [];
    setMembers(data.members || []);
    window.DATA.COLUMNS       = data.columns       || [];
    window.DATA.LABELS        = data.labels        || {};
    window.DATA.PROJECTS      = data.projects      || [];
    window.DATA.WORKSPACE     = data.workspace     || {};
    window.DATA.WORKSPACES    = data.workspaces    || [];
    setIsOwner(!!(data.workspace?.is_owner));
    setWsLogoUrl(data.workspace?.logo_url || null);
    window.DATA.NOTIFICATIONS = data.notifications || [];
    window.DATA.ACTIVITY      = data.activity      || [];
    window.DATA.THROUGHPUT    = data.throughput    || [];
    window.CURRENT_USER       = data.user;
    window.CURRENT_PROJECT_ID = data.current_project;
    window.__CURRENT_WS_ID__  = data.workspace?.id || null;
    setCurrentWsId(data.workspace?.id || null);

    const unread = (data.notifications || []).filter(n => n.unread).length;
    setNotifCount(unread);

    const nextStatus = ['away', 'dnd'].includes(data.user?.status) ? data.user.status : 'online';
    setOwnStatus(nextStatus, { manual: nextStatus === 'away', persist: false });
  }

  // ── Workspace ready (after setup) ─────────────────────────────────────────
  const handleWorkspaceReady = () => {
    API.bootstrap()
      .then((data) => {
        _applyBootstrap(data);
        setTasks(data.tasks || []);
        setCurrentProject(data.current_project ? { id: data.current_project } : null);
        if (data.online_users) _applyOnlineUsers(data.online_users);
        if (data.workspaces)   setWorkspaces(data.workspaces);
        setNeedsWorkspace(false);
      })
      .catch((e) => window.showToast?.('Veriler yüklenemedi: ' + e.message, 'error'));
  };

  // ── Workspace switching ───────────────────────────────────────────────────
  const handleSwitchWorkspace = async (wsId) => {
    try {
      await API.switchWorkspace(wsId);
      // Notify socket server to update rooms
      if (window.SOCKET) window.SOCKET.emit('switch_workspace', { workspace_id: wsId });
      const data = await API.bootstrap();
      _applyBootstrap(data);
      setTasks(data.tasks || []);
      setCurrentProject(data.current_project ? { id: data.current_project } : null);
      if (data.online_users) _applyOnlineUsers(data.online_users);
      if (data.workspaces)   setWorkspaces(data.workspaces);
      setWsSwitcherOpen(false);
    } catch (e) { window.showToast?.('Çalışma alanı değiştirilemedi: ' + e.message, 'error'); }
  };

  const handleWsLogoChange = (logoUrl) => {
    setWsLogoUrl(logoUrl || null);
    window.DATA.WORKSPACE = { ...(window.DATA.WORKSPACE || {}), logo_url: logoUrl || null };
    setWorkspaces(prev => {
      const currentId = window.DATA.WORKSPACE?.id;
      const next = (prev || []).map(ws =>
        ws.id === currentId || ws.is_current ? { ...ws, logo_url: logoUrl || null } : ws
      );
      window.DATA.WORKSPACES = next;
      return next;
    });
  };

  // ── Task operations ───────────────────────────────────────────────────────

  const moveTask = async (id, colId) => {
    const prev = tasks;
    const col = DATA.COLUMNS.find(c => c.id === colId);
    setTasks(tasks.map(t => t.id === id ? { ...t, col: colId, progress: col?.is_done ? 100 : t.progress } : t));
    if (drawerTask?.id === id) setDrawerTask(dt => ({ ...dt, col: colId }));
    try { await API.updateTask(id, { col: colId }); }
    catch (e) { setTasks(prev); console.error('moveTask failed:', e.message); }
  };

  const updateTitle = async (id, title) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, title } : t));
    try { await API.updateTask(id, { title }); } catch (e) { console.error(e); }
  };

  const createTask = async (formData) => {
    const projectId = window.CURRENT_PROJECT_ID || 1;
    try {
      const created = await API.createTask(projectId, formData);
      setTasks(prev => [created, ...prev]);
    } catch (e) { window.showToast?.('Görev oluşturulamadı: ' + e.message, 'error'); }
  };

  const deleteTask = async (id) => {
    setTasks(tasks.filter(t => t.id !== id));
    setDrawerTask(null);
    try { await API.deleteTask(id); } catch (e) { console.error(e); }
  };

  // ── Project switch ────────────────────────────────────────────────────────

  const switchProject = async (projectId) => {
    if (switchAbortRef.current === projectId) return; // same project already loading
    switchAbortRef.current = projectId;
    setProjectSwitching(true);
    try {
      const data = await API.bootstrap(projectId);
      if (switchAbortRef.current !== projectId) return; // superseded by a newer click
      _applyBootstrap(data);
      setTasks(data.tasks || []);
      setCurrentProject(data.current_project ? { id: data.current_project } : null);
      setView('board');
    } catch (e) {
      console.error('switchProject failed:', e.message);
    } finally {
      if (switchAbortRef.current === projectId) {
        switchAbortRef.current = null;
        setProjectSwitching(false);
      }
    }
  };

  const handleCreateProject = async (name, color, icon) => {
    try {
      const p = await API.createProject({ name, color, icon });
      window.DATA.PROJECTS = [...(window.DATA.PROJECTS || []), p];
      await switchProject(p.id);
      setProjectModal(false);
    } catch (e) { window.showToast?.('Proje oluşturulamadı: ' + e.message, 'error'); }
  };

  const openChat = (dmWithSlug) => {
    const slug = typeof dmWithSlug === 'string' ? dmWithSlug : null;
    setChatDmWith(slug);
    setChatOpen(true);
    window.__CHAT_OPEN__ = true;
  };
  window.__OPEN_CHAT__ = openChat;
  window.__APP_TASKS__ = tasks;
  window.__OPEN_TASK_BY_ID__ = (taskId) => {
    const t = tasks.find(x => String(x.id) === String(taskId));
    if (t) { setDrawerTask(t); setNotifOpen(false); }
  };

  const handleCmd = (action) => {
    if (action.startsWith('goto:'))       setView(action.slice(5));
    else if (action === 'new:task')       { if (canManageTasks) openModal('todo'); }
    else if (action === 'open:notifs')    setNotifOpen(true);
    else if (action === 'open:chat')      openChat();
    else if (action === 'new:project')    { if (canManageProjects) setProjectModal(true); }
    else if (action === 'toggle:theme') {
      const order = ['light','cream','dark'];
      setTweak('theme', order[(order.indexOf(tweaks.theme) + 1) % order.length]);
    }
    else if (action === 'toggle:sidebar') setTweak('sidebarCollapsed', !tweaks.sidebarCollapsed);
    else if (action === 'logout')         handleLogout();
  };

  // ── Auth ──────────────────────────────────────────────────────────────────

  const handleSignIn = (extraData) => {
    API.bootstrap()
      .then((data) => {
        if (data.needs_workspace) {
          window.CURRENT_USER = data.user;
          setAuthed(true); setNeedsWorkspace(true);
          return;
        }
        _applyBootstrap(data);
        setTasks(data.tasks || []);
        setCurrentProject(data.current_project ? { id: data.current_project } : null);
        if (data.online_users) _applyOnlineUsers(data.online_users);
        if (data.workspaces)   setWorkspaces(data.workspaces);
        setAuthed(true); setNeedsWorkspace(false);
      })
      .catch((e) => window.showToast?.('Veri yüklenemedi: ' + e.message, 'error'));
  };

  const handleLogout = async () => {
    if (window.SOCKET) { window.SOCKET.disconnect(); window.SOCKET = null; setSocket(null); }
    try { await API.logout(); } catch (_) {}
    window.DATA.MEMBERS = []; window.DATA.COLUMNS = []; window.DATA.LABELS = {};
    window.DATA.PROJECTS = []; window.DATA.WORKSPACE = {}; window.DATA.WORKSPACES = [];
    setAuthed(false); setNeedsWorkspace(false); setIsOwner(false);
    setTasks([]); setOnlineUsers(new Map()); setWorkspaces([]);
    setWsLogoUrl(null);
    setTweak('theme', 'cream');
  };

  const openDrawer = (task) => setDrawerTask(task);
  const closeDrawer = () => setDrawerTask(null);
  const openModal = (colId, dates = null) => {
    if (!canManageTasks) return;
    setModalCol(colId || 'todo');
    setModalInitialDates(dates || null);
    setModalOpen(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-logo-wrap">
            <img
              src="/static/StoaBoard_symbol.png" alt=""
              style={{ width: 36, height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)', display: 'block' }}
              onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'; }}
            />
          </div>
          <div className="loading-brand">Stoa<em>Board</em></div>
          <div className="loading-bar-wrap"><div className="loading-bar" /></div>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="app" data-auth="true">
        <AuthPage onSignIn={handleSignIn} />
      </div>
    );
  }

  if (needsWorkspace) {
    return (
      <div className="app" data-auth="true">
        <WorkspaceSetupPage onReady={handleWorkspaceReady} onLogout={handleLogout} />
      </div>
    );
  }

  const crumb = { board:'Pano', list:'Liste', calendar:'Takvim', dashboard:'Ana Sayfa', settings:'Ayarlar' }[view] || 'Pano';
  const noProject = !currentProject && DATA.PROJECTS.length === 0;

  // Convert onlineUsers map to Set of online slugs (for backward compat) and expose full map
  const onlineSet = new Set(onlineUsers.keys());
  return (
    <div className="app">
      <ToastContainer />
      <div
        className="sidebar-backdrop"
        data-open={mobileSidebarOpen}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <Sidebar
        collapsed={tweaks.sidebarCollapsed}
        onCollapseToggle={() => setTweak('sidebarCollapsed', !tweaks.sidebarCollapsed)}
        view={view} onView={(v) => { setView(v); setMobileSidebarOpen(false); }}
        projects={DATA.PROJECTS}
        members={members}
        openCmd={() => { setCmdOpen(true); setMobileSidebarOpen(false); }}
        onlineUsers={onlineSet}
        onlineStatuses={onlineUsers}
        onChatOpen={(...args) => { openChat(...args); setMobileSidebarOpen(false); }}
        onSwitchProject={(id) => { switchProject(id); setMobileSidebarOpen(false); }}
        onNewProject={() => { setProjectModal(true); setMobileSidebarOpen(false); }}
        canManageProjects={canManageProjects}
        workspaces={workspaces}
        wsLogoUrl={wsLogoUrl}
        onSwitchWorkspace={handleSwitchWorkspace}
        wsSwitcherOpen={wsSwitcherOpen}
        onWsSwitcherToggle={() => setWsSwitcherOpen(v => !v)}
        onAddWorkspace={() => { setWsSwitcherOpen(false); setWsJoinModalOpen(true); }}
        unreadCounts={unreadCounts}
        currentWsId={currentWsId}
        currentStatus={myStatusState}
        onStatusChange={(s) => {
          clearTimeout(activityTimer.current);
          setOwnStatus(s, { manual: s === 'away' });
          if (s === 'online') {
            activityTimer.current = setTimeout(() => {
              setOwnStatus('away', { auto: true });
            }, ((window.CURRENT_USER?.away_timeout) || 15) * 60 * 1000);
          }
        }}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <div className="main">
        <Topbar
          view={view} onView={setView}
          openCmd={() => setCmdOpen(true)}
          openNotifs={() => { setNotifOpen(!notifOpen); setNotifCount(0); }}
          openModal={() => openModal('todo')}
          activeCrumb={crumb}
          onChatOpen={() => openChat()}
          notifCount={notifCount}
          canManageTasks={canManageTasks}
          onMobileMenuToggle={() => setMobileSidebarOpen(v => !v)}
        />

        {noProject && view !== 'settings' ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, color:'var(--ink-muted)' }}>
            <Icon name="layoutBoard" size={48} strokeWidth={1} />
            <div style={{ fontSize:22, fontFamily:'var(--font-display)', color:'var(--ink)' }}>Henüz proje yok</div>
            <div style={{ fontSize:14 }}>İlk projenizi oluşturun.</div>
            {canManageProjects && (
              <button className="btn btn-primary" onClick={() => setProjectModal(true)}>
                <Icon name="plus" size={14} /> Proje Oluştur
              </button>
            )}
          </div>
        ) : (
          <>
            {view === 'board'     && <BoardView key={currentProject?.id || 'default'} tasks={tasks} onOpenTask={openDrawer} onMoveTask={moveTask} onDeleteTask={deleteTask} tweaks={tweaks} onOpenModal={openModal} onTitleChange={updateTitle} canManageTasks={canManageTasks} canManageProjects={canManageProjects} switching={projectSwitching} />}
            {view === 'list'      && <ListView tasks={tasks} onOpenTask={openDrawer} onMoveTask={moveTask} canManageTasks={canManageTasks} />}
            {view === 'calendar'  && <CalendarView tasks={tasks} onOpenTask={openDrawer} onOpenModal={openModal} canCreateTasks={canManageTasks} />}
            {view === 'dashboard' && <DashboardView tasks={tasks} onOpenTask={openDrawer} onView={setView} />}
          </>
        )}
        {view === 'settings' && <SettingsView tweaks={tweaks} setTweak={setTweak} onLogout={handleLogout} onWsLogoChange={handleWsLogoChange} onMembersChange={setMembers} />}
      </div>

      <TaskDrawer
        open={!!drawerTask} task={drawerTask} onClose={closeDrawer}
        onMoveTask={moveTask}
        onTaskUpdate={(updated) => {
          setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
          setDrawerTask(prev => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);
        }}
        onDelete={deleteTask}
        onCreateTask={(newTask) => setTasks(prev => [newTask, ...prev])}
        canManageTasks={canManageTasks}
      />
      <AddTaskModal open={canManageTasks && modalOpen} onClose={() => { setModalOpen(false); setModalInitialDates(null); }} defaultCol={modalCol} onCreate={createTask} initialDates={modalInitialDates} />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onAction={handleCmd} />
      <NotifPanel
        open={notifOpen}
        onClose={() => { setNotifOpen(false); setNotifCount(0); }}
        socket={socket}
        onOpenTask={(task) => { setNotifOpen(false); setDrawerTask(task); }}
        onOpenChat={(slug) => { setNotifOpen(false); openChat(slug); }}
        currentWsId={currentWsId}
      />
      <ChatPanel
        open={chatOpen}
        onClose={() => { setChatOpen(false); setChatDmWith(null); window.__CHAT_OPEN__ = false; }}
        onlineUsers={onlineSet}
        onlineStatuses={onlineUsers}
        members={members}
        socket={socket}
        initialDmWith={chatDmWith}
        unreadCounts={unreadCounts}
        markAsRead={markAsRead}
        wsId={currentWsId}
      />
      <TweaksPanel tweaks={tweaks} setTweak={setTweak} visible={tweaksAvailable} />
      {projectModal && canManageProjects && <NewProjectModal onClose={() => setProjectModal(false)} onCreate={handleCreateProject} />}
      {wsJoinModalOpen && (
        <AddWorkspaceModal
          onClose={() => setWsJoinModalOpen(false)}
          onDone={async (wsId) => {
            setWsJoinModalOpen(false);
            await handleSwitchWorkspace(wsId);
          }}
        />
      )}
    </div>
  );
}

// ── New Project Modal ─────────────────────────────────────────────────────

function ProjectIconPicker({ selected, color, onChange }) {
  const icons = window.PROJECT_ICONS || [];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(10,1fr)', gap:4, maxHeight:180, overflowY:'auto', padding:'2px 0' }}>
      {icons.map(({ id, label }) => (
        <button key={id+label} type="button" title={label} onClick={() => onChange(id)}
          style={{
            width:32, height:32, borderRadius:8, display:'grid', placeItems:'center',
            background: selected === id ? color : 'var(--bg-raised)',
            color: selected === id ? 'white' : 'var(--ink-muted)',
            border: selected === id ? `2px solid ${color}` : '2px solid transparent',
            cursor:'pointer', transition:'all 0.12s', flexShrink:0,
          }}>
          <Icon name={id} size={15} strokeWidth={1.8} />
        </button>
      ))}
    </div>
  );
}

function NewProjectModal({ onClose, onCreate }) {
  const [name, setName]   = React.useState('');
  const [color, setColor] = React.useState('oklch(55% 0.13 25)');
  const [icon, setIcon]   = React.useState('folder');
  const [loading, setLoading] = React.useState(false);

  const colors = [
    ['Terracotta','oklch(55% 0.13 25)'], ['Sage','oklch(55% 0.09 150)'],
    ['Indigo','oklch(52% 0.15 270)'],    ['Plum','oklch(50% 0.14 340)'],
    ['Amber','oklch(65% 0.11 70)'],      ['Slate','oklch(50% 0.04 250)'],
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await onCreate(name.trim(), color, icon);
    setLoading(false);
  };

  return (
    <div className="modal-overlay" data-open="true" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">Yeni Proje</div>
          <div className="modal-sub">Projeniz için isim, renk ve ikon seçin.</div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="field">
              <label>Proje Adı</label>
              <input autoFocus placeholder="Örn: Web Sitesi, Mobil Uygulama..." value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Renk</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', padding:'2px 0' }}>
                {colors.map(([label, val]) => (
                  <button key={val} type="button" title={label} onClick={() => setColor(val)}
                    style={{ width:28, height:28, borderRadius:7, background:val, cursor:'pointer', flexShrink:0,
                      border: color===val ? '3px solid var(--ink)' : '2px solid transparent',
                      boxShadow: color===val ? '0 0 0 1px var(--bg), 0 0 0 3px var(--ink)' : 'none',
                      transition: 'box-shadow 0.15s' }} />
                ))}
              </div>
            </div>
            <div className="field">
              <label>İkon</label>
              <ProjectIconPicker selected={icon} color={color} onChange={setIcon} />
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>İptal</button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim() || loading}>
              {loading ? 'Oluşturuluyor…' : 'Proje Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add/Join Workspace Modal ──────────────────────────────────────────────

function AddWorkspaceModal({ onClose, onDone }) {
  const [tab, setTab]       = React.useState('create');
  const [wsName, setWsName] = React.useState('');
  const [code, setCode]     = React.useState('');
  const [error, setError]   = React.useState('');
  const [busy, setBusy]     = React.useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!wsName.trim()) return;
    setError(''); setBusy(true);
    try {
      const res = await API.createWorkspace({ name: wsName.trim() });
      onDone(res.workspace_id);
    } catch (err) {
      setError(err.message || 'Bir hata oluştu');
      setBusy(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setError(''); setBusy(true);
    try {
      const res = await API.joinWorkspace(code.trim());
      onDone(res.workspace_id);
    } catch (err) {
      setError(err.message || 'Geçersiz davet kodu');
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" data-open="true" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <div className="modal-title">Takım Ekle</div>
          <div className="modal-sub">Yeni bir takım kur veya mevcut bir takıma katıl.</div>
        </div>
        <div className="modal-body" style={{ paddingTop: 0 }}>
          <div className="modal-tabs" style={{ marginBottom: 20 }}>
            <button className="modal-tab-btn" data-active={tab === 'create'} onClick={() => { setTab('create'); setError(''); }}>Takım Kur</button>
            <button className="modal-tab-btn" data-active={tab === 'join'}   onClick={() => { setTab('join');   setError(''); }}>Takıma Katıl</button>
          </div>
          {error && (
            <div style={{ padding:'8px 12px', borderRadius:8, background:'oklch(58% 0.13 10 / 0.12)', color:'var(--status-rose)', fontSize:12, marginBottom:12 }}>
              {error}
            </div>
          )}
          {tab === 'create' ? (
            <form onSubmit={handleCreate}>
              <div className="field">
                <label>Takım Adı</label>
                <input autoFocus placeholder="Örn: Yeni Proje, Kişisel…" value={wsName} onChange={e => setWsName(e.target.value)} required />
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={onClose}>İptal</button>
                <button type="submit" className="btn btn-primary" disabled={busy || !wsName.trim()}>
                  {busy ? 'Oluşturuluyor…' : 'Takımı Kur'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleJoin}>
              <div className="field">
                <label>Davet Kodu</label>
                <input autoFocus placeholder="ABCD1234" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8}
                  style={{ fontFamily:'var(--font-mono)', letterSpacing:'0.1em', fontSize:18, textAlign:'center' }} required />
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={onClose}>İptal</button>
                <button type="submit" className="btn btn-primary" disabled={busy || code.length < 6}>
                  {busy ? 'Katılınıyor…' : 'Takıma Katıl'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

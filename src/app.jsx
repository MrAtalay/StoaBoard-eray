// Main app

const { useState: useS, useEffect: useEf } = React;

function App() {
  const [authed, setAuthed] = useS(() => localStorage.getItem('stoa.authed') === '1');
  const [view, setView] = useS(() => localStorage.getItem('stoa.view') || 'board');
  const [tasks, setTasks] = useS(DATA.TASKS);
  const [drawerTask, setDrawerTask] = useS(null);
  const [modalOpen, setModalOpen] = useS(false);
  const [modalCol, setModalCol] = useS('todo');
  const [cmdOpen, setCmdOpen] = useS(false);
  const [notifOpen, setNotifOpen] = useS(false);
  const [tweaksAvailable, setTweaksAvailable] = useS(false);

  const [tweaks, setTweaks] = useS(() => {
    const saved = localStorage.getItem('stoa.tweaks');
    return saved ? JSON.parse(saved) : (window.__TWEAKS__ || {});
  });

  const setTweak = (key, value) => {
    const next = { ...tweaks, [key]: value };
    setTweaks(next);
    localStorage.setItem('stoa.tweaks', JSON.stringify(next));
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: value } }, '*'); } catch (e) {}
  };

  useEf(() => localStorage.setItem('stoa.view', view), [view]);
  useEf(() => { document.documentElement.dataset.theme = tweaks.theme; }, [tweaks.theme]);
  useEf(() => { document.documentElement.dataset.accent = tweaks.accent; }, [tweaks.accent]);
  useEf(() => { document.documentElement.dataset.fontpair = tweaks.fontPair; }, [tweaks.fontPair]);
  useEf(() => { document.documentElement.dataset.density = tweaks.density; }, [tweaks.density]);

  // Tweaks toolbar integration
  useEf(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksAvailable(true);
      else if (e.data?.type === '__deactivate_edit_mode') setTweaksAvailable(false);
    };
    window.addEventListener('message', handler);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}
    return () => window.removeEventListener('message', handler);
  }, []);

  // Keyboard shortcuts
  useEf(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(true); }
      else if (e.key === 'Escape') { setDrawerTask(null); setModalOpen(false); setCmdOpen(false); setNotifOpen(false); }
      else if (e.key === 'n' && !e.metaKey && !e.ctrlKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && !document.activeElement.isContentEditable) {
        setModalCol('todo'); setModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const moveTask = (id, colId) => {
    const col = DATA.COLUMNS.find(c => c.id === colId);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, col: colId, progress: col?.is_done ? 100 : t.progress } : t));
    API.updateTask(id, { col: colId }).catch(e => console.error('moveTask API error:', e));
  };
  const updateTitle = (id, title) => setTasks(tasks.map(t => t.id === id ? { ...t, title } : t));
  const createTask = (newTask) => setTasks(prev => [newTask, ...prev]);

  const handleTaskUpdate = (update) => {
    setTasks(prev => prev.map(t => t.id === update.id ? { ...t, ...update } : t));
    setDrawerTask(prev => prev && prev.id === update.id ? { ...prev, ...update } : prev);
  };

  const handleDeleteTask = async (id) => {
    try {
      await API.deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      setDrawerTask(null);
    } catch (e) {
      alert('Görev silinemedi: ' + e.message);
    }
  };

  const openModal = (colId) => { setModalCol(colId || 'todo'); setModalOpen(true); };
  const openDrawer = (task) => setDrawerTask(task);
  const closeDrawer = () => setDrawerTask(null);

  const handleCmd = (action) => {
    if (action.startsWith('goto:')) setView(action.slice(5));
    else if (action === 'new:task') openModal('todo');
    else if (action === 'open:notifs') setNotifOpen(true);
    else if (action === 'toggle:theme') {
      const order = ['light','cream','dark'];
      setTweak('theme', order[(order.indexOf(tweaks.theme) + 1) % order.length]);
    } else if (action === 'toggle:sidebar') setTweak('sidebarCollapsed', !tweaks.sidebarCollapsed);
    else if (action === 'logout') { localStorage.removeItem('stoa.authed'); setAuthed(false); }
  };

  if (!authed) {
    return (
      <div className="app" data-auth="true">
        <AuthPage onSignIn={() => { localStorage.setItem('stoa.authed', '1'); setAuthed(true); }} />
      </div>
    );
  }

  const crumb = view === 'board' ? 'Pano' : view === 'list' ? 'Liste' : view === 'calendar' ? 'Takvim' : view === 'dashboard' ? 'Ana Sayfa' : view === 'settings' ? 'Ayarlar' : 'Pano';

  return (
    <div className="app">
      <Sidebar
        collapsed={tweaks.sidebarCollapsed}
        onCollapseToggle={() => setTweak('sidebarCollapsed', !tweaks.sidebarCollapsed)}
        view={view}
        onView={setView}
        projects={DATA.PROJECTS}
        openCmd={() => setCmdOpen(true)}
      />
      <div className="main">
        <Topbar
          view={view}
          onView={setView}
          openCmd={() => setCmdOpen(true)}
          openNotifs={() => setNotifOpen(!notifOpen)}
          openModal={() => openModal('todo')}
          activeCrumb={crumb}
        />
        {view === 'board' && (
          <BoardView
            tasks={tasks}
            onOpenTask={openDrawer}
            onMoveTask={moveTask}
            tweaks={tweaks}
            onOpenModal={openModal}
            onTitleChange={updateTitle}
          />
        )}
        {view === 'list' && <ListView tasks={tasks} onOpenTask={openDrawer} onMoveTask={moveTask} />}
        {view === 'calendar' && <CalendarView tasks={tasks} onOpenTask={openDrawer} />}
        {view === 'dashboard' && <DashboardView tasks={tasks} onOpenTask={openDrawer} />}
        {view === 'settings' && <SettingsView tweaks={tweaks} setTweak={setTweak} projectId={DATA.PROJECTS[0]?.id} />}
      </div>

      <TaskDrawer
        open={!!drawerTask}
        task={drawerTask}
        onClose={closeDrawer}
        onMoveTask={moveTask}
        onTaskUpdate={handleTaskUpdate}
        onDelete={handleDeleteTask}
        onCreateTask={createTask}
      />
      <AddTaskModal open={modalOpen} onClose={() => setModalOpen(false)} defaultCol={modalCol} onCreate={createTask} />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onAction={handleCmd} />
      <NotifPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      <TweaksPanel tweaks={tweaks} setTweak={setTweak} visible={tweaksAvailable} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

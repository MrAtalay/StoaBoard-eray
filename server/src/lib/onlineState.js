// Python karşılığı: app/online_state.py
//
// Bellek-içi presence tracking. { userId: { sid, status } } map'i tutar.
// Status: 'online' | 'away' | 'dnd' | 'offline'.

const online = new Map(); // userId(int) -> { sid: string, status: string }

export function setOnline(userId, sid) {
  const existing = online.get(userId);
  const existingStatus = existing?.status || 'online';
  // 'dnd' durumu yeniden bağlantıda korunsun
  const status = existingStatus === 'dnd' ? 'dnd' : 'online';
  online.set(userId, { sid, status });
}

export function setOffline(userId) {
  online.delete(userId);
}

export function setStatus(userId, status) {
  const entry = online.get(userId);
  if (entry) {
    entry.status = status;
    online.set(userId, entry);
  }
}

export function getStatus(userId) {
  return online.get(userId)?.status || 'offline';
}

export function isOnline(userId) {
  return online.has(userId);
}

export function getOnlineIds() {
  return Array.from(online.keys());
}

const API_BASE = 'http://localhost:5000/api';

export async function authMe() {
  const res = await fetch(`${API_BASE}/auth/me`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch auth status');
  const data = await res.json();
  return data.user;
}

export async function authLogout() {
  const res = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to logout');
  return res.json();
}

export async function fetchStudySessions() {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch study sessions');
  const data = await res.json();
  return data.sessions || [];
}

export async function fetchStudySession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch study session');
  const data = await res.json();
  return data.session;
}

export async function deleteStudySession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete study session');
  return res.json();
}

export async function saveStudySession({ roleId, roleTitle, stepKey, state }) {
  const res = await fetch(`${API_BASE}/sessions/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      role_id: roleId,
      role_title: roleTitle,
      step_key: stepKey,
      state,
    }),
  });
  if (!res.ok) throw new Error('Failed to save study session');
  const data = await res.json();
  return data.session_id;
}


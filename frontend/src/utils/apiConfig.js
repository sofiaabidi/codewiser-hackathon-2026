const DEFAULT_API_BASE = 'http://localhost:5000/api';

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getApiBase() {
  const envBase = import.meta.env.VITE_API_BASE_URL;
  if (!envBase || typeof envBase !== 'string') return DEFAULT_API_BASE;
  const trimmed = envBase.trim();
  if (!trimmed) return DEFAULT_API_BASE;
  return trimTrailingSlash(trimmed);
}

export function getBackendOrigin() {
  const apiBase = getApiBase();
  return apiBase.endsWith('/api') ? apiBase.slice(0, -4) : apiBase;
}

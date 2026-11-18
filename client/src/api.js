const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function getToken() {
  return localStorage.getItem('civicgaps-token');
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      body: options.body instanceof FormData ? options.body : options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new Error('Can’t reach CivicGaps right now. Check that the local server is running.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && getToken()) {
      localStorage.removeItem('civicgaps-token');
      window.dispatchEvent(new Event('civicgaps-session-expired'));
    }
    throw new Error(payload.error?.message || 'The request could not be completed.');
  }
  return payload;
}

export const imageUrl = (src) => src ? `${API_URL.replace('/api','')}${src}` : '';

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

const AUTH_STORAGE_KEYS = [
  'access_token',
  'refresh_token',
  'user_role',
  'user_name',
  'user_modules',
  'user_job_title',
  'user_username',
];

const AUTH_URLS = ['/token/', '/token/refresh/', '/token/logout/'];
const REFRESH_LOCK = 'crm-jwt-refresh';
const AUTH_CHANNEL = 'crm-auth';

let loggedOut = false;
let sessionEpoch = 0;
let refreshInFlight = null;
const authChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(AUTH_CHANNEL)
  : null;

const clearSession = () => {
  AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
};

const applyTokens = (access, refresh, epoch) => {
  if (loggedOut) return;
  if (epoch !== undefined && epoch !== sessionEpoch) return;
  if (access) localStorage.setItem('access_token', access);
  if (refresh) localStorage.setItem('refresh_token', refresh);
};

if (authChannel) {
  authChannel.addEventListener('message', (event) => {
    const payload = event.data || {};
    if (payload.type === 'logout') {
      loggedOut = true;
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return;
    }
    if (payload.type === 'tokens') {
      applyTokens(payload.access, payload.refresh);
    }
  });
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

const logout = async () => {
  loggedOut = true;
  sessionEpoch += 1;
  const refresh = localStorage.getItem('refresh_token');
  clearSession();
  authChannel?.postMessage({ type: 'logout' });
  try {
    if (refresh) {
      await api.post('/token/logout/', { refresh });
    }
  } catch {
    // Local session is cleared even if the server already rejected the token.
  }
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

const withRefreshLock = (fn) => {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(REFRESH_LOCK, fn);
  }
  return fn();
};

const refreshAccessToken = (failedAccess) => {
  const epoch = sessionEpoch;
  if (!refreshInFlight) {
    refreshInFlight = withRefreshLock(async () => {
      if (loggedOut || epoch !== sessionEpoch) {
        throw new Error('logged out');
      }
      const currentAccess = localStorage.getItem('access_token');
      if (currentAccess && currentAccess !== failedAccess) {
        return currentAccess;
      }
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        throw new Error('no refresh');
      }
      const res = await api.post('/token/refresh/', { refresh: refreshToken });
      if (loggedOut || epoch !== sessionEpoch) {
        throw new Error('logged out');
      }
      applyTokens(res.data.access, res.data.refresh, epoch);
      authChannel?.postMessage({
        type: 'tokens',
        access: res.data.access,
        refresh: res.data.refresh,
      });
      return res.data.access;
    }).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    const isAuthUrl = AUTH_URLS.some(url => originalRequest?.url?.endsWith(url));
    if (error.response?.status === 401 && !isAuthUrl && !originalRequest._retry && !loggedOut) {
      originalRequest._retry = true;
      const failedAccess = localStorage.getItem('access_token');
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const access = await refreshAccessToken(failedAccess);
          originalRequest.headers['Authorization'] = `Bearer ${access}`;
          return api(originalRequest);
        } catch {
          // Refresh failed — fall through to logout
        }
      }
      logout();
    }
    return Promise.reject(error);
  }
);

const beginSession = () => {
  sessionEpoch += 1;
  loggedOut = false;
};

export { logout, beginSession };
export default api;

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
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

// Endpoints where a 401 must not trigger a refresh attempt
// (login failure or an invalid/expired refresh token itself).
const AUTH_URLS = ['/token/', '/token/refresh/', '/token/logout/'];

const logout = async () => {
  const refresh = localStorage.getItem('refresh_token');
  try {
    if (refresh) {
      await api.post('/token/logout/', { refresh });
    }
  } catch {
    // Local session is cleared even if the server already rejected the token.
  }
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('user_name');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

// Response interceptor to handle token refresh (single attempt, then logout)
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    const isAuthUrl = AUTH_URLS.some(url => originalRequest?.url?.endsWith(url));
    if (error.response?.status === 401 && !isAuthUrl && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const res = await api.post('/token/refresh/', { refresh: refreshToken });
          localStorage.setItem('access_token', res.data.access);
          originalRequest.headers['Authorization'] = `Bearer ${res.data.access}`;
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

export { logout };
export default api;

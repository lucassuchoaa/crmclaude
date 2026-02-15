/**
 * api.js - Centralized API service layer
 *
 * Connects the frontend to the backend running at http://localhost:3001/api.
 * Handles authentication tokens, request/response interceptors, automatic
 * token refresh on 401 errors, and exposes typed functions for every endpoint.
 */

import axios from 'axios';

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const TOKEN_KEYS = {
  access: 'accessToken',
  refresh: 'refreshToken',
};

/**
 * Persist both tokens to localStorage and update the in-memory cache so that
 * the request interceptor always has the latest value without re-reading
 * localStorage on every request.
 *
 * @param {string} accessToken
 * @param {string} refreshToken
 */
export function setTokens(accessToken, refreshToken) {
  localStorage.setItem(TOKEN_KEYS.access, accessToken);
  localStorage.setItem(TOKEN_KEYS.refresh, refreshToken);
}

/**
 * Return the current access token from localStorage.
 *
 * @returns {string|null}
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEYS.access);
}

/**
 * Return the current refresh token from localStorage.
 *
 * @returns {string|null}
 */
export function getRefreshToken() {
  return localStorage.getItem(TOKEN_KEYS.refresh);
}

/**
 * Remove both tokens from localStorage, effectively logging the user out
 * on the client side.
 */
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEYS.access);
  localStorage.removeItem(TOKEN_KEYS.refresh);
}

// ---------------------------------------------------------------------------
// Request interceptor — attach Bearer token
// ---------------------------------------------------------------------------

api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Response interceptor — handle 401 and attempt token refresh
// ---------------------------------------------------------------------------

/**
 * Tracks whether a refresh is already in-flight so that concurrent 401
 * responses do not trigger multiple simultaneous refresh requests.
 */
let isRefreshing = false;

/**
 * Queue of resolve/reject callbacks waiting for the refresh to complete.
 * @type {Array<{resolve: Function, reject: Function}>}
 */
let refreshSubscribers = [];

function onRefreshSuccess(newAccessToken) {
  refreshSubscribers.forEach(({ resolve }) => resolve(newAccessToken));
  refreshSubscribers = [];
}

function onRefreshFailure(error) {
  refreshSubscribers.forEach(({ reject }) => reject(error));
  refreshSubscribers = [];
}

/**
 * Returns a promise that resolves once the in-flight refresh completes
 * successfully, or rejects if it fails.
 *
 * @returns {Promise<string>} Resolves with the new access token.
 */
function waitForRefresh() {
  return new Promise((resolve, reject) => {
    refreshSubscribers.push({ resolve, reject });
  });
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh for 401 responses that have not already been retried.
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const storedRefreshToken = getRefreshToken();
    if (!storedRefreshToken) {
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // If a refresh is already underway, queue this request.
    if (isRefreshing) {
      try {
        const newAccessToken = await waitForRefresh();
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    // This request is the first to encounter a 401 — start the refresh flow.
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const response = await axios.post(
        `${BASE_URL}/auth/refresh`,
        { refreshToken: storedRefreshToken },
        { headers: { 'Content-Type': 'application/json' } },
      );

      const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
        response.data;

      setTokens(newAccessToken, newRefreshToken ?? storedRefreshToken);
      onRefreshSuccess(newAccessToken);

      // Retry the original request with the new token.
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      onRefreshFailure(refreshError);
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// ---------------------------------------------------------------------------
// Auth API
// POST /auth/login
// POST /auth/refresh
// POST /auth/logout
// GET  /auth/me
// ---------------------------------------------------------------------------

export const authApi = {
  /**
   * Authenticate with email and password.
   * On success the response contains { accessToken, refreshToken, user }.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async login(email, password) {
    const response = await api.post('/auth/login', { email, password });
    const { accessToken, refreshToken } = response.data;
    if (accessToken) {
      setTokens(accessToken, refreshToken ?? '');
    }
    return response;
  },

  /**
   * Manually refresh the access token using the stored refresh token.
   *
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async refresh() {
    const storedRefreshToken = getRefreshToken();
    const response = await api.post('/auth/refresh', {
      refreshToken: storedRefreshToken,
    });
    const { accessToken, refreshToken } = response.data;
    if (accessToken) {
      setTokens(accessToken, refreshToken ?? storedRefreshToken);
    }
    return response;
  },

  /**
   * Invalidate the current session on the server and clear local tokens.
   *
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async logout() {
    const storedRefreshToken = getRefreshToken();
    try {
      const response = await api.post('/auth/logout', {
        refreshToken: storedRefreshToken,
      });
      return response;
    } finally {
      clearTokens();
    }
  },

  /**
   * Retrieve the profile of the currently authenticated user.
   *
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  me() {
    return api.get('/auth/me');
  },
};

// ---------------------------------------------------------------------------
// Users API
// GET    /users
// POST   /users
// PUT    /users/:id
// DELETE /users/:id
// ---------------------------------------------------------------------------

export const usersApi = {
  /**
   * List users, optionally filtered/paginated via query params.
   *
   * @param {Record<string, unknown>} [params]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getAll(params = {}) {
    return api.get('/users', { params });
  },

  /**
   * Retrieve a single user by id.
   *
   * @param {string|number} id
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getById(id) {
    return api.get(`/users/${id}`);
  },

  /**
   * Create a new user.
   *
   * @param {Record<string, unknown>} data
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  create(data) {
    return api.post('/users', data);
  },

  /**
   * Update an existing user by id.
   *
   * @param {string|number} id
   * @param {Record<string, unknown>} data
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  update(id, data) {
    return api.put(`/users/${id}`, data);
  },

  /**
   * Delete a user by id.
   *
   * @param {string|number} id
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  delete(id) {
    return api.delete(`/users/${id}`);
  },
};

// ---------------------------------------------------------------------------
// Indications API
// GET   /indications
// POST  /indications
// PUT   /indications/:id
// PATCH /indications/:id/status
// GET   /indications/board/kanban
// ---------------------------------------------------------------------------

export const indicationsApi = {
  /**
   * List indications with optional filters / pagination.
   *
   * @param {Record<string, unknown>} [params]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getAll(params = {}) {
    return api.get('/indications', { params });
  },

  /**
   * Retrieve a single indication by id.
   *
   * @param {string|number} id
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getById(id) {
    return api.get(`/indications/${id}`);
  },

  /**
   * Create a new indication.
   *
   * @param {Record<string, unknown>} data
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  create(data) {
    return api.post('/indications', data);
  },

  /**
   * Update an indication by id.
   *
   * @param {string|number} id
   * @param {Record<string, unknown>} data
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  update(id, data) {
    return api.put(`/indications/${id}`, data);
  },

  /**
   * Update only the status field of an indication.
   *
   * @param {string|number} id
   * @param {string} status
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  updateStatus(id, status) {
    return api.patch(`/indications/${id}/status`, { status });
  },

  /**
   * Retrieve the Kanban board view of indications grouped by status.
   *
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getKanban() {
    return api.get('/indications/board/kanban');
  },
};

// ---------------------------------------------------------------------------
// Commissions API
// GET  /commissions
// POST /commissions
// ---------------------------------------------------------------------------

export const commissionsApi = {
  /**
   * List commissions with optional filters / pagination.
   *
   * @param {Record<string, unknown>} [params]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getAll(params = {}) {
    return api.get('/commissions', { params });
  },

  /**
   * Create a new commission record.
   *
   * @param {Record<string, unknown>} data
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  create(data) {
    return api.post('/commissions', data);
  },
};

// ---------------------------------------------------------------------------
// NFEs API
// GET  /nfes
// POST /nfes
// ---------------------------------------------------------------------------

export const nfesApi = {
  /**
   * List NFEs with optional filters / pagination.
   *
   * @param {Record<string, unknown>} [params]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getAll(params = {}) {
    return api.get('/nfes', { params });
  },

  /**
   * Create a new NFE record.
   *
   * @param {Record<string, unknown>} data
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  create(data) {
    return api.post('/nfes', data);
  },
};

// ---------------------------------------------------------------------------
// Materials API
// GET /materials
// ---------------------------------------------------------------------------

export const materialsApi = {
  /**
   * List materials with optional filters / pagination.
   *
   * @param {Record<string, unknown>} [params]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getAll(params = {}) {
    return api.get('/materials', { params });
  },
};

// ---------------------------------------------------------------------------
// Notifications API
// GET   /notifications
// PATCH /notifications/:id/read
// ---------------------------------------------------------------------------

export const notificationsApi = {
  /**
   * List notifications with optional filters.
   *
   * @param {Record<string, unknown>} [params]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getAll(params = {}) {
    return api.get('/notifications', { params });
  },

  /**
   * Mark a single notification as read.
   *
   * @param {string|number} id
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  markAsRead(id) {
    return api.patch(`/notifications/${id}/read`);
  },
};

// ---------------------------------------------------------------------------
// Dashboard API
// GET /dashboard/stats
// ---------------------------------------------------------------------------

export const dashboardApi = {
  /**
   * Retrieve aggregate statistics used by the dashboard page.
   *
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getStats() {
    return api.get('/dashboard/stats');
  },
};

// ---------------------------------------------------------------------------
// Default export — the raw Axios instance for ad-hoc requests
// ---------------------------------------------------------------------------

export default api;

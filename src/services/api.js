import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Token storage
let accessToken = localStorage.getItem('accessToken');
let refreshToken = localStorage.getItem('refreshToken');

// Request interceptor - Add auth token
api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;

          // Update tokens
          setTokens(newAccessToken, newRefreshToken);

          // Retry original request
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed, clear tokens and redirect to login
          clearTokens();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      } else {
        // No refresh token, redirect to login
        clearTokens();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// Token management
export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export function getAccessToken() {
  return accessToken;
}

// Auth API
export const authApi = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  logout: () =>
    api.post('/auth/logout', { refreshToken }),

  refresh: () =>
    api.post('/auth/refresh', { refreshToken }),

  me: () =>
    api.get('/auth/me'),

  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

// Users API
export const usersApi = {
  getAll: (params) =>
    api.get('/users', { params }),

  getById: (id) =>
    api.get(`/users/${id}`),

  create: (data) =>
    api.post('/users', data),

  update: (id, data) =>
    api.put(`/users/${id}`, data),

  delete: (id) =>
    api.delete(`/users/${id}`),

  getTeam: (id) =>
    api.get(`/users/${id}/team`),
};

// Indications API
export const indicationsApi = {
  getAll: (params) =>
    api.get('/indications', { params }),

  getById: (id) =>
    api.get(`/indications/${id}`),

  create: (data) =>
    api.post('/indications', data),

  update: (id, data) =>
    api.put(`/indications/${id}`, data),

  delete: (id) =>
    api.delete(`/indications/${id}`),

  getKanban: () =>
    api.get('/indications/board/kanban'),
};

// Commissions API
export const commissionsApi = {
  getAll: (params) =>
    api.get('/commissions', { params }),

  create: (data) =>
    api.post('/commissions', data),

  updateStatus: (id, status, paymentDate) =>
    api.patch(`/commissions/${id}/status`, { status, payment_date: paymentDate }),

  getSummary: (params) =>
    api.get('/commissions/summary', { params }),
};

// NFEs API
export const nfesApi = {
  getAll: (params) =>
    api.get('/nfes', { params }),

  getById: (id) =>
    api.get(`/nfes/${id}`),

  create: (data) =>
    api.post('/nfes', data),

  updateStatus: (id, status, notes) =>
    api.patch(`/nfes/${id}/status`, { status, notes }),

  delete: (id) =>
    api.delete(`/nfes/${id}`),

  getSummary: () =>
    api.get('/nfes/stats/summary'),
};

// Materials API
export const materialsApi = {
  getAll: (params) =>
    api.get('/materials', { params }),

  getById: (id) =>
    api.get(`/materials/${id}`),

  create: (data) =>
    api.post('/materials', data),

  update: (id, data) =>
    api.put(`/materials/${id}`, data),

  delete: (id) =>
    api.delete(`/materials/${id}`),

  getCategories: () =>
    api.get('/materials/meta/categories'),
};

// Notifications API
export const notificationsApi = {
  getAll: (params) =>
    api.get('/notifications', { params }),

  markAsRead: (id) =>
    api.patch(`/notifications/${id}/read`),

  markAllAsRead: () =>
    api.post('/notifications/read-all'),

  delete: (id) =>
    api.delete(`/notifications/${id}`),

  deleteRead: () =>
    api.delete('/notifications'),

  send: (data) =>
    api.post('/notifications/send', data),

  broadcast: (data) =>
    api.post('/notifications/broadcast', data),
};

// Dashboard API
export const dashboardApi = {
  getStats: () =>
    api.get('/dashboard/stats'),

  getTeamPerformance: () =>
    api.get('/dashboard/team-performance'),

  getCharts: (period) =>
    api.get('/dashboard/charts', { params: { period } }),
};

// CNPJ API (Receita Federal via BrasilAPI)
export const cnpjApi = {
  /**
   * Consulta CNPJ na Receita Federal
   * @param {string} cnpj - CNPJ com ou sem formatação
   */
  lookup: (cnpj) =>
    api.get(`/cnpj/${encodeURIComponent(cnpj)}`),
};

// HubSpot Integration API
export const hubspotApi = {
  /**
   * Busca empresa no HubSpot pelo CNPJ e verifica oportunidades
   * @param {string} cnpj - CNPJ para buscar
   */
  search: (cnpj) =>
    api.post('/hubspot/search', { cnpj }),

  /**
   * Testa conexão com HubSpot
   */
  test: () =>
    api.get('/hubspot/test'),

  /**
   * Salva configuração do HubSpot (API Key)
   * @param {string} apiKey - API Key do HubSpot
   */
  saveConfig: (apiKey) =>
    api.post('/hubspot/config', { apiKey }),
};

// Groups API (Chat Gerente-Parceiro)
export const groupsApi = {
  getAll: () => api.get('/groups'),
  getMessages: (gId, pId, params) => api.get(`/groups/${gId}/${pId}/messages`, { params }),
  sendMessage: (gId, pId, data) => api.post(`/groups/${gId}/${pId}/messages`, data),
};

// CNPJ Agent API
export const cnpjAgentApi = {
  check: (data) => api.post('/cnpj-agent/check', data),
  createIndication: (data) => api.post('/cnpj-agent/create-indication', data),
};

// Diretoria API
export const diretoriaApi = {
  getSummary: () => api.get('/diretoria/summary'),
};

// WhatsApp API
export const whatsappApi = {
  connectInstance: () => api.post('/whatsapp/instance/connect'),
  getStatus: () => api.get('/whatsapp/instance/status'),
  getQr: () => api.get('/whatsapp/instance/qr'),
  disconnect: () => api.post('/whatsapp/instance/disconnect'),
};

export default api;

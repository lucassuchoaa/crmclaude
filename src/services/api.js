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

  delete: (id, data) =>
    api.delete(`/users/${id}`, { data }),

  getTeam: (id) =>
    api.get(`/users/${id}/team`),

  resetPassword: (id) =>
    api.post(`/users/${id}/reset-password`),
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

  addHistory: (id, txt, action = 'obs') =>
    api.post(`/indications/${id}/history`, { txt, action }),

  getActivity: (limit = 20) =>
    api.get('/indications/activity/recent', { params: { limit } }),

  getAudit: (params) =>
    api.get('/indications/audit', { params }),
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

  create: (formData) =>
    api.post('/materials', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),

  update: (id, data) =>
    api.put(`/materials/${id}`, data),

  delete: (id) =>
    api.delete(`/materials/${id}`),

  getCategories: () =>
    api.get('/materials/meta/categories'),

  download: (id) =>
    api.get(`/materials/${id}/download`, { responseType: 'blob' }),
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

// HubSpot Integration API
export const hubspotApi = {
  search: (cnpj) =>
    api.post('/hubspot/search', { cnpj }),

  test: () =>
    api.get('/hubspot/test'),

  getConfig: () =>
    api.get('/hubspot/config'),

  saveConfig: ({ apiKey, pipelineId }) =>
    api.post('/hubspot/config', { apiKey, pipelineId }),

  getPipelines: () =>
    api.get('/hubspot/pipelines'),

  createCompanyDeal: (indicationId) =>
    api.post('/hubspot/create-company-deal', { indication_id: indicationId }),

  sync: () =>
    api.post('/hubspot/sync'),
};

// Groups API (Chat Gerente-Parceiro)
export const groupsApi = {
  getAll: () => api.get('/groups'),
  getMessages: (gId, pId, params) => api.get(`/groups/${gId}/${pId}/messages`, { params }),
  sendMessage: (gId, pId, data) => api.post(`/groups/${gId}/${pId}/messages`, data),
};

// CNPJ Agent API
export const cnpjAgentApi = {
  lookup: (cnpj) => api.get(`/cnpj-agent/lookup/${encodeURIComponent(cnpj)}`),
  check: (data) => api.post('/cnpj-agent/check', data),
  createIndication: (data) => api.post('/cnpj-agent/create-indication', data),
};

// Convenios API
export const conveniosApi = {
  getAll: () => api.get('/convenios'),
  create: (data) => api.post('/convenios', data),
  update: (id, data) => api.put(`/convenios/${id}`, data),
  delete: (id) => api.delete(`/convenios/${id}`),
  getParceiros: (id) => api.get(`/convenios/${id}/parceiros`),
  getIndications: (id) => api.get(`/convenios/${id}/indications`),
  getStats: (id) => api.get(`/convenios/${id}/stats`),
  addParceiro: (id, parceiroId) => api.post(`/convenios/${id}/parceiros`, { parceiro_id: parceiroId }),
  removeParceiro: (id, parceiroId) => api.delete(`/convenios/${id}/parceiros/${parceiroId}`),
  getParceiroConvenios: (parceiroId) => api.get(`/convenios/parceiro/${parceiroId}/convenios`),
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

// Teams API
export const teamsApi = {
  getAll: () => api.get('/teams'),
  getById: (id) => api.get(`/teams/${id}`),
  getMyTeams: () => api.get('/teams/user/my-teams'),
  create: (data) => api.post('/teams', data),
  update: (id, data) => api.put(`/teams/${id}`, data),
  delete: (id) => api.delete(`/teams/${id}`),
};

// Pipelines API
export const pipelinesApi = {
  getAll: (params) => api.get('/pipelines', { params }),
  create: (data) => api.post('/pipelines', data),
  update: (id, data) => api.put(`/pipelines/${id}`, data),
  delete: (id) => api.delete(`/pipelines/${id}`),
  getStages: (id) => api.get(`/pipelines/${id}/stages`),
  getDeals: (id) => api.get(`/pipelines/${id}/deals`),
  createDeal: (pipelineId, data) => api.post(`/pipelines/${pipelineId}/deals`, data),
  getStats: () => api.get('/pipelines/stats/summary'),
  getAutomations: (id) => api.get(`/pipelines/${id}/automations`),
  createAutomation: (id, data) => api.post(`/pipelines/${id}/automations`, data),
  deleteAutomation: (id) => api.delete(`/pipelines/automations/${id}`),
  biOverview: (params) => api.get('/pipelines/bi/overview', { params }),
  biByOwner: (params) => api.get('/pipelines/bi/by-owner', { params }),
  biByStage: (params) => api.get('/pipelines/bi/by-stage', { params }),
  biLossReasons: (params) => api.get('/pipelines/bi/loss-reasons', { params }),
  biTimeline: (params) => api.get('/pipelines/bi/timeline', { params }),
  biActivityRanking: (params) => api.get('/pipelines/bi/activity-ranking', { params }),
};

// Products API
export const productsApi = {
  getAll: () => api.get('/products'),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
};

// Deals API
export const dealsApi = {
  update: (id, data) => api.put(`/pipelines/deals/${id}`, data),
  moveStage: (id, stage_id) => api.patch(`/pipelines/deals/${id}/stage`, { stage_id }),
  delete: (id) => api.delete(`/pipelines/deals/${id}`),
  getActivities: (dealId) => api.get(`/pipelines/deals/${dealId}/activities`),
  createActivity: (dealId, data) => api.post(`/pipelines/deals/${dealId}/activities`, data),
  getTasks: (dealId) => api.get(`/pipelines/deals/${dealId}/tasks`),
  createTask: (dealId, data) => api.post(`/pipelines/deals/${dealId}/tasks`, data),
  completeTask: (id, is_completed) => api.patch(`/pipelines/tasks/${id}/complete`, { is_completed }),
  deleteTask: (id) => api.delete(`/pipelines/tasks/${id}`),
  getContacts: (dealId) => api.get(`/pipelines/deals/${dealId}/contacts`),
  addContact: (dealId, data) => api.post(`/pipelines/deals/${dealId}/contacts`, data),
  deleteContact: (id) => api.delete(`/pipelines/deals/contacts/${id}`),
};

export default api;

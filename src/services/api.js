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

  populateUf: () =>
    api.post('/users/populate-uf'),
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

  create: (data, file) => {
    if (file) {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
      fd.append('file', file);
      return api.post('/commissions', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    }
    return api.post('/commissions', data);
  },

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

  create: (data, file) => {
    if (file) {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
      fd.append('file', file);
      return api.post('/nfes', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    }
    return api.post('/nfes', data);
  },

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

// NetSuite API
export const netsuiteApi = {
  getConfig: () => api.get('/netsuite/config'),
  saveConfig: (data) => api.post('/netsuite/config', data),
  test: () => api.get('/netsuite/test'),
  sync: () => api.post('/netsuite/sync'),
  getSyncLog: () => api.get('/netsuite/sync-log'),
  getMappings: () => api.get('/netsuite/mappings'),
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

// Google Integration API
export const googleApi = {
  getConfig: () => api.get('/google/config'),
  saveConfig: (data) => api.post('/google/config', data),
  getAuthUrl: () => api.get('/google/auth-url'),
  getStatus: () => api.get('/google/status'),
  disconnect: () => api.post('/google/disconnect'),
  getCalendarEvents: (params) => api.get('/google/calendar/events', { params }),
  createCalendarEvent: (data) => api.post('/google/calendar/events', data),
  sendEmail: (data) => api.post('/google/gmail/send', data),
};

// Proposals API
export const proposalsApi = {
  getTemplates: () => api.get('/proposals/templates'),
  createTemplate: (formData) => api.post('/proposals/templates', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateTemplate: (id, data) => api.put(`/proposals/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/proposals/templates/${id}`),
  downloadTemplate: (id) => api.get(`/proposals/templates/${id}/download`, { responseType: 'blob' }),
  generate: (data) => api.post('/proposals/generate', data),
  getByEntity: (type, id) => api.get(`/proposals/entity/${type}/${id}`),
  updateStatus: (id, status) => api.patch(`/proposals/${id}/status`, { status }),
  delete: (id) => api.delete(`/proposals/${id}`),
};

// Contracts API
export const contractsApi = {
  getTemplates: () => api.get('/contracts/templates'),
  createTemplate: (formData) => api.post('/contracts/templates', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateTemplate: (id, data) => api.put(`/contracts/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/contracts/templates/${id}`),
  downloadTemplate: (id) => api.get(`/contracts/templates/${id}/download`, { responseType: 'blob' }),
  generate: (data) => api.post('/contracts/generate', data),
  getByEntity: (type, id) => api.get(`/contracts/entity/${type}/${id}`),
  updateStatus: (id, status) => api.patch(`/contracts/${id}/status`, { status }),
  delete: (id) => api.delete(`/contracts/${id}`),
  // ClickSign
  getClickSignConfig: () => api.get('/contracts/clicksign/config'),
  saveClickSignConfig: (data) => api.post('/contracts/clicksign/config', data),
  testClickSign: () => api.post('/contracts/clicksign/test'),
  sendToClickSign: (data) => api.post('/contracts/clicksign/send', data),
  checkClickSignStatus: (contractId) => api.post('/contracts/clicksign/status', { contract_id: contractId }),
};

// Permissions API
export const permissionsApi = {
  getAll: () => api.get('/permissions'),
  getMy: () => api.get('/permissions/my'),
  update: (role, data) => api.put(`/permissions/${role}`, data),
  reset: (role) => api.post(`/permissions/reset/${role}`),
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

// Leads API
export const leadsApi = {
  getAll: (params) => api.get('/leads', { params }),
  getById: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post('/leads', data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  delete: (id) => api.delete(`/leads/${id}`),
  enrich: (id) => api.post(`/leads/${id}/enrich`),
  importCsv: (data) => api.post('/leads/import', data),
  convert: (id, data) => api.post(`/leads/${id}/convert`, data),
  getActivities: (id, params) => api.get(`/leads/${id}/activities`, { params }),
  addActivity: (id, data) => api.post(`/leads/${id}/activities`, data),
  assign: (id, owner_id) => api.patch(`/leads/${id}/assign`, { owner_id }),
  // Scoring
  getScoringRules: () => api.get('/leads/scoring/rules'),
  createScoringRule: (data) => api.post('/leads/scoring/rules', data),
  updateScoringRule: (id, data) => api.put(`/leads/scoring/rules/${id}`, data),
  deleteScoringRule: (id) => api.delete(`/leads/scoring/rules/${id}`),
  recalculateScores: () => api.post('/leads/scoring/recalculate'),
  // Segments
  getSegments: () => api.get('/leads/segments'),
  createSegment: (data) => api.post('/leads/segments', data),
  updateSegment: (id, data) => api.put(`/leads/segments/${id}`, data),
  deleteSegment: (id) => api.delete(`/leads/segments/${id}`),
  getSegmentLeads: (id) => api.get(`/leads/segments/${id}/leads`),
  // List Generator
  listGenerator: (params) => api.get('/leads/list-generator', { params }),
  listGeneratorFilters: () => api.get('/leads/list-generator/filters'),
  listGeneratorEnrichCnpjs: (data) => api.post('/leads/list-generator/enrich-cnpjs', data),
  listGeneratorImport: (data) => api.post('/leads/list-generator/import', data),
  // Dashboard
  dashboardOverview: () => api.get('/leads/dashboard/overview'),
  dashboardFunnel: () => api.get('/leads/dashboard/funnel'),
  dashboardSources: () => api.get('/leads/dashboard/sources'),
  dashboardTeam: () => api.get('/leads/dashboard/team-performance'),
};

// Cadences API
export const cadencesApi = {
  getAll: (params) => api.get('/cadences', { params }),
  getById: (id) => api.get(`/cadences/${id}`),
  create: (data) => api.post('/cadences', data),
  update: (id, data) => api.put(`/cadences/${id}`, data),
  delete: (id) => api.delete(`/cadences/${id}`),
  updateStatus: (id, status) => api.patch(`/cadences/${id}/status`, { status }),
  duplicate: (id) => api.post(`/cadences/${id}/duplicate`),
  getSteps: (id) => api.get(`/cadences/${id}/steps`),
  addStep: (id, data) => api.post(`/cadences/${id}/steps`, data),
  enroll: (id, lead_ids) => api.post(`/cadences/${id}/enroll`, { lead_ids }),
  unenroll: (id, lead_ids) => api.post(`/cadences/${id}/unenroll`, { lead_ids }),
  getEnrollments: (id) => api.get(`/cadences/${id}/enrollments`),
  getStats: (id) => api.get(`/cadences/${id}/stats`),
};

// Landing Pages API
export const landingPagesApi = {
  getAll: () => api.get('/landing-pages'),
  getById: (id) => api.get(`/landing-pages/${id}`),
  create: (data) => api.post('/landing-pages', data),
  update: (id, data) => api.put(`/landing-pages/${id}`, data),
  delete: (id) => api.delete(`/landing-pages/${id}`),
  duplicate: (id) => api.post(`/landing-pages/${id}/duplicate`),
  getSubmissions: (id) => api.get(`/landing-pages/${id}/submissions`),
  getStats: (id) => api.get(`/landing-pages/${id}/stats`),
};

// Workflows API
export const workflowsApi = {
  getAll: () => api.get('/workflows'),
  getById: (id) => api.get(`/workflows/${id}`),
  create: (data) => api.post('/workflows', data),
  update: (id, data) => api.put(`/workflows/${id}`, data),
  delete: (id) => api.delete(`/workflows/${id}`),
  toggle: (id) => api.patch(`/workflows/${id}/toggle`),
};

// Inbox API
export const inboxApi = {
  getAll: (params) => api.get('/inbox', { params }),
  getThreads: () => api.get('/inbox/threads'),
  send: (data) => api.post('/inbox', data),
  markRead: (id) => api.patch(`/inbox/${id}/read`),
  markAllRead: () => api.post('/inbox/mark-all-read'),
};

// AI Agent API
export const aiApi = {
  chat: (data) => api.post('/ai/chat', data),
  getConversations: () => api.get('/ai/conversations'),
  getConversation: (id) => api.get(`/ai/conversations/${id}`),
  deleteConversation: (id) => api.delete(`/ai/conversations/${id}`),
};

export default api;

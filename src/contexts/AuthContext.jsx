import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, setTokens, clearTokens } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if user is authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const response = await authApi.me();
          setUser(response.data.user);
        } catch (_err) {
          clearTokens();
          setUser(null);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      setError(null);
      const response = await authApi.login(email, password);
      const { user, accessToken, refreshToken } = response.data;

      setTokens(accessToken, refreshToken);
      setUser(user);

      return { success: true, user };
    } catch (err) {
      const message = err.response?.data?.error || 'Erro ao fazer login';
      setError(message);
      return { success: false, error: message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (_err) {
      // Ignore logout errors
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((updates) => {
    setUser(prev => ({ ...prev, ...updates }));
  }, []);

  const hasRole = useCallback((requiredRole) => {
    if (!user) return false;

    const roleHierarchy = {
      super_admin: 5,
      executivo: 4,
      diretor: 3,
      gerente: 2,
      parceiro: 1,
    };

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  }, [user]);

  const canAccessRoute = useCallback((allowedRoles) => {
    if (!user) return false;
    if (!allowedRoles || allowedRoles.length === 0) return true;
    return allowedRoles.includes(user.role);
  }, [user]);

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    updateUser,
    hasRole,
    canAccessRoute,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;

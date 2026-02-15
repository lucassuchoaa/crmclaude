import { useState, useEffect } from 'react';
import { Card } from '../components/ui';
import { dashboardApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await dashboardApi.getStats();
      setStats(response.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value || 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Bem-vindo, {user?.name}!
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Aqui esta o resumo das suas atividades
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card.Stat
          title="Total de Indicacoes"
          value={stats?.indications?.total || 0}
          change={`${stats?.monthly?.newIndications || 0} este mes`}
          changeType="neutral"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />

        <Card.Stat
          title="Indicacoes Fechadas"
          value={stats?.indications?.byStatus?.fechado || 0}
          change={`${stats?.indications?.conversionRate || 0}% conversao`}
          changeType="positive"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        <Card.Stat
          title="Valor Total Fechado"
          value={formatCurrency(stats?.indications?.closedValue)}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        <Card.Stat
          title="Comissoes Pagas"
          value={formatCurrency(stats?.commissions?.paid)}
          change={formatCurrency(stats?.commissions?.pending) + ' pendente'}
          changeType="neutral"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
      </div>

      {/* Pipeline Overview */}
      <Card title="Pipeline de Indicacoes">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { key: 'novo', label: 'Novo', color: 'bg-blue-500' },
            { key: 'em_contato', label: 'Em Contato', color: 'bg-cyan-500' },
            { key: 'proposta', label: 'Proposta', color: 'bg-yellow-500' },
            { key: 'negociacao', label: 'Negociacao', color: 'bg-orange-500' },
            { key: 'fechado', label: 'Fechado', color: 'bg-green-500' },
            { key: 'perdido', label: 'Perdido', color: 'bg-red-500' },
          ].map((status) => (
            <div key={status.key} className="text-center">
              <div className={`w-full h-2 rounded-full ${status.color} mb-2`} />
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats?.indications?.byStatus?.[status.key] || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {status.label}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Activity */}
      <Card title="Atividades Recentes">
        {stats?.recentActivity?.length > 0 ? (
          <div className="space-y-3">
            {stats.recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {activity.title}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {activity.user_name}
                    </p>
                  </div>
                </div>
                <span className={`
                  px-2 py-1 text-xs font-medium rounded-full
                  ${activity.status === 'fechado'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                    : activity.status === 'perdido'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                  }
                `}>
                  {activity.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            Nenhuma atividade recente
          </p>
        )}
      </Card>
    </div>
  );
}

export default DashboardPage;

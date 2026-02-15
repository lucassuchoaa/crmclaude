const variants = {
  primary: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  secondary: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  info: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
};

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

function Badge({
  children,
  variant = 'primary',
  size = 'md',
  dot = false,
  removable = false,
  onRemove,
  className = '',
}) {
  const classes = [
    'inline-flex items-center font-medium rounded-full',
    variants[variant] || variants.primary,
    sizes[size] || sizes.md,
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
            variant === 'success' ? 'bg-green-500' :
            variant === 'warning' ? 'bg-yellow-500' :
            variant === 'danger' ? 'bg-red-500' :
            'bg-blue-500'
          }`}
        />
      )}
      {children}
      {removable && (
        <button
          onClick={onRemove}
          className="ml-1.5 -mr-0.5 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          aria-label="Remove"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </span>
  );
}

// Status badge for indications
Badge.Status = function StatusBadge({ status }) {
  const statusConfig = {
    novo: { variant: 'info', label: 'Novo' },
    em_contato: { variant: 'primary', label: 'Em Contato' },
    proposta: { variant: 'warning', label: 'Proposta' },
    negociacao: { variant: 'secondary', label: 'Negociacao' },
    fechado: { variant: 'success', label: 'Fechado' },
    perdido: { variant: 'danger', label: 'Perdido' },
  };

  const config = statusConfig[status] || { variant: 'secondary', label: status };

  return <Badge variant={config.variant} dot>{config.label}</Badge>;
};

// Role badge
Badge.Role = function RoleBadge({ role }) {
  const roleConfig = {
    super_admin: { variant: 'danger', label: 'Super Admin' },
    executivo: { variant: 'primary', label: 'Executivo' },
    diretor: { variant: 'info', label: 'Diretor' },
    gerente: { variant: 'warning', label: 'Gerente' },
    parceiro: { variant: 'success', label: 'Parceiro' },
  };

  const config = roleConfig[role] || { variant: 'secondary', label: role };

  return <Badge variant={config.variant} size="sm">{config.label}</Badge>;
};

export default Badge;

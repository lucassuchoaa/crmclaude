function Card({
  children,
  title,
  subtitle,
  actions,
  padding = true,
  className = '',
  headerClassName = '',
  bodyClassName = '',
}) {
  return (
    <div
      className={`
        bg-white dark:bg-gray-800
        rounded-xl shadow-sm
        border border-gray-200 dark:border-gray-700
        ${className}
      `}
    >
      {(title || actions) && (
        <div
          className={`
            flex items-center justify-between
            px-6 py-4
            border-b border-gray-200 dark:border-gray-700
            ${headerClassName}
          `}
        >
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className={`${padding ? 'p-6' : ''} ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}

// Stat card variant
Card.Stat = function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon,
  className = '',
}) {
  const changeColors = {
    positive: 'text-green-600 dark:text-green-400',
    negative: 'text-red-600 dark:text-red-400',
    neutral: 'text-gray-600 dark:text-gray-400',
  };

  return (
    <Card className={className}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {value}
          </p>
          {change && (
            <p className={`mt-1 text-sm ${changeColors[changeType]}`}>
              {changeType === 'positive' && '+'}
              {change}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg text-blue-600 dark:text-blue-400">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

export default Card;

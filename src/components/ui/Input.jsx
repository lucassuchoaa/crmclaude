import { forwardRef } from 'react';

const Input = forwardRef(({
  label,
  error,
  helper,
  type = 'text',
  className = '',
  containerClassName = '',
  required = false,
  disabled = false,
  leftIcon,
  rightIcon,
  ...props
}, ref) => {
  const inputStyles = `
    w-full px-4 py-2 rounded-lg border transition-colors duration-200
    bg-white dark:bg-gray-800
    text-gray-900 dark:text-gray-100
    border-gray-300 dark:border-gray-600
    placeholder-gray-400 dark:placeholder-gray-500
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
    disabled:bg-gray-100 disabled:cursor-not-allowed dark:disabled:bg-gray-700
    ${error ? 'border-red-500 focus:ring-red-500' : ''}
    ${leftIcon ? 'pl-10' : ''}
    ${rightIcon ? 'pr-10' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  return (
    <div className={`space-y-1 ${containerClassName}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          type={type}
          className={inputStyles}
          disabled={disabled}
          required={required}
          {...props}
        />

        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {rightIcon}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {helper && !error && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{helper}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;

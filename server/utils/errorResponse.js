const IS_PROD = () => process.env.NODE_ENV === 'production';

export function safeErrorMessage(err, fallback = 'Internal error') {
  if (IS_PROD()) return fallback;
  if (err && typeof err.message === 'string') return err.message;
  return fallback;
}

export function safeErrorBody(err, fallback = 'Internal error', extra = {}) {
  const body = { error: fallback, ...extra };
  if (!IS_PROD() && err && typeof err.message === 'string') {
    body.detail = err.message;
  }
  return body;
}

export const INDICATION_STATUSES = ['novo', 'em_contato', 'proposta', 'negociacao', 'fechado', 'perdido'];
export const COMMISSION_STATUSES = ['pending', 'approved', 'paid', 'cancelled'];
export const NFE_STATUSES = ['pending', 'approved', 'rejected', 'paid'];

export function validateCnpj(cnpj) {
  if (!cnpj) return { valid: false, cleaned: null, error: 'CNPJ é obrigatório.' };
  const cleaned = cnpj.replace(/[^\d]/g, '');
  if (cleaned.length !== 14) return { valid: false, cleaned, error: 'CNPJ inválido. Deve conter 14 dígitos.' };
  return { valid: true, cleaned, error: null };
}

export function validateStatus(status, allowed) {
  if (!status) return { valid: false, error: 'Status é obrigatório.' };
  if (!allowed.includes(status)) return { valid: false, error: `Status inválido. Valores permitidos: ${allowed.join(', ')}` };
  return { valid: true, error: null };
}

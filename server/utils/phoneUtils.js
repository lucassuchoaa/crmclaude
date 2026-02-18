/**
 * Normaliza telefone: remove formatação e prefixo 55
 * "55 (11) 99999-1234" → "11999991234"
 */
export function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  // Remove prefixo 55 (Brasil) se presente e telefone ficaria com 10-11 dígitos
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits.slice(2);
  }
  return digits;
}

/**
 * JID do WhatsApp → telefone nacional
 * "5511999991234@s.whatsapp.net" → "11999991234"
 */
export function jidToPhone(jid) {
  if (!jid) return '';
  const num = jid.split('@')[0].replace(/\D/g, '');
  // Remove prefixo 55
  if (num.startsWith('55') && num.length >= 12) {
    return num.slice(2);
  }
  return num;
}

/**
 * Telefone nacional → JID do WhatsApp
 * "11999991234" → "5511999991234@s.whatsapp.net"
 */
export function phoneToJid(phone) {
  const digits = normalizePhone(phone);
  return `55${digits}@s.whatsapp.net`;
}

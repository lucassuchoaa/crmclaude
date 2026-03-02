const BASE_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || '';

async function request(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  console.log(`[EvolutionAPI] ${method} ${path}`);
  const res = await fetch(url, opts);

  const text = await res.text().catch(() => '');

  if (!res.ok) {
    console.error(`[EvolutionAPI] ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    throw new Error(`Evolution API ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    console.warn(`[EvolutionAPI] Non-JSON response for ${path}:`, text.slice(0, 200));
    return { raw: text };
  }
}

export async function createInstance(name) {
  return request('POST', '/instance/create', {
    instanceName: name,
    qrcode: true,
    token: '',
  });
}

export async function connectInstance(name) {
  return request('GET', `/instance/connect/${name}`);
}

export async function fetchQrCode(name) {
  return request('GET', `/instance/connect/${name}`);
}

export async function getInstanceStatus(name) {
  return request('GET', `/instance/connectionState/${name}`);
}

export async function sendText(name, jid, text) {
  return request('POST', `/message/sendText/${name}`, {
    number: jid,
    textMessage: { text },
  });
}

export async function logoutInstance(name) {
  return request('DELETE', `/instance/logout/${name}`);
}

export async function deleteInstance(name) {
  return request('DELETE', `/instance/delete/${name}`);
}

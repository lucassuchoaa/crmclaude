const BASE_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || '';

async function request(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Evolution API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export async function createInstance(name) {
  return request('POST', '/instance/create', {
    instanceName: name,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
  });
}

export async function connectInstance(name) {
  return request('GET', `/instance/connect/${name}`);
}

export async function getInstanceStatus(name) {
  return request('GET', `/instance/connectionState/${name}`);
}

export async function sendText(name, jid, text) {
  return request('POST', `/message/sendText/${name}`, {
    number: jid,
    text,
  });
}

export async function logoutInstance(name) {
  return request('DELETE', `/instance/logout/${name}`);
}

export async function deleteInstance(name) {
  return request('DELETE', `/instance/delete/${name}`);
}

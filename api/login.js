// ============================================================
//  ALAMO ANALYTICS — Login
//  Arquivo: api/login.js
//
//  Valida email + senha, retorna JWT se usuário ativo
// ============================================================

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET || 'alamo-secret-change-me';

async function kvGet(key) {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  const raw = d.result;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + JWT_SECRET);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// JWT simples sem biblioteca
function createJWT(payload) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g,'');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  });
  const sig = Buffer.from(JWT_SECRET + header + body).toString('base64').replace(/=/g,'');
  return `${header}.${body}.${sig}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'Email e senha obrigatórios' });

    const emailNorm = email.toLowerCase().trim();
    const raw = await kvGet(`user:${emailNorm}`);

    if (!raw) return res.status(401).json({ error: 'Email ou senha incorretos' });

    // kvGet já retorna objeto parseado
    const user = typeof raw === 'object' ? raw : JSON.parse(raw);

    // Verifica senha
    const hash = await hashPassword(senha);
    if (hash !== user.senha) return res.status(401).json({ error: 'Email ou senha incorretos' });

    // Verifica status
    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Acesso pendente. Aguarde a aprovação do administrador.' });
    }
    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'Acesso bloqueado. Entre em contato com o administrador.' });
    }

    const token = createJWT({
      email: user.email,
      nome: user.nome,
      role: user.role
    });

    return res.status(200).json({
      ok: true,
      token,
      nome: user.nome,
      email: user.email,
      role: user.role
    });

  } catch (err) {
    console.error('[login.js]', err);
    return res.status(500).json({ error: err.message });
  }
}

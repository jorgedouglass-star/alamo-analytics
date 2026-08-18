// ============================================================
//  ALAMO ANALYTICS — Painel Admin
//  Arquivo: api/admin.js
//
//  Endpoints:
//  GET  /api/admin?action=users       → lista usuários
//  POST /api/admin  { action: 'approve', email }   → aprova
//  POST /api/admin  { action: 'block',   email }   → bloqueia
//  POST /api/admin  { action: 'role',    email, role } → muda role
//  GET  /api/admin?action=meses       → lista meses importados
//  POST /api/admin  { action: 'deleteMes', mes }   → remove mês
// ============================================================

const KV_URL     = process.env.KV_REST_API_URL;
const KV_TOKEN   = process.env.KV_REST_API_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET || 'alamo-secret-change-me';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

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

async function kvSet(key, value) {
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
}

async function kvDel(key) {
  await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
}

function verifyAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const pad = (s) => s + '='.repeat((4 - s.length % 4) % 4);
    const data = JSON.parse(Buffer.from(pad(parts[1]), 'base64').toString('utf-8'));
    if (data.exp < Date.now() / 1000) return null;
    if (data.email !== ADMIN_EMAIL && data.role !== 'admin') return null;
    return data;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });

  try {
    // GET actions
    if (req.method === 'GET') {
      const action = req.query.action;

      if (action === 'users') {
        const idxRaw = await kvGet('index:users');
        const emails = Array.isArray(idxRaw) ? idxRaw : (idxRaw ? (typeof idxRaw === 'string' ? JSON.parse(idxRaw) : []) : []);
        const users = await Promise.all(emails.map(async email => {
          const raw = await kvGet(`user:${email}`);
          if (!raw) return null;
          const u = JSON.parse(raw);
          return { email: u.email, nome: u.nome, status: u.status, role: u.role, createdAt: u.createdAt };
        }));
        return res.status(200).json({ users: users.filter(Boolean) });
      }

      if (action === 'meses') {
        const idxRaw = await kvGet('index:meses');
        const meses = Array.isArray(idxRaw) ? idxRaw : (idxRaw ? (typeof idxRaw === 'string' ? JSON.parse(idxRaw) : []) : []);
        return res.status(200).json({ meses });
      }

      return res.status(400).json({ error: 'action inválida' });
    }

    // POST actions
    if (req.method === 'POST') {
      const { action, email, role, mes } = req.body;

      if (action === 'approve' || action === 'block' || action === 'activate') {
        const emailNorm = email?.toLowerCase();
        const raw = await kvGet(`user:${emailNorm}`);
        if (!raw) return res.status(404).json({ error: 'Usuário não encontrado' });
        const user = typeof raw === 'object' ? raw : JSON.parse(raw);
        user.status = action === 'approve' ? 'active' : action === 'block' ? 'blocked' : 'active';
        await kvSet(`user:${emailNorm}`, JSON.stringify(user));
        return res.status(200).json({ ok: true, status: user.status });
      }

      if (action === 'role') {
        const emailNorm = email?.toLowerCase();
        const validRoles = ['viewer', 'uploader', 'admin'];
        if (!validRoles.includes(role)) return res.status(400).json({ error: 'Role inválido' });
        const raw = await kvGet(`user:${emailNorm}`);
        if (!raw) return res.status(404).json({ error: 'Usuário não encontrado' });
        const user = typeof raw === 'object' ? raw : JSON.parse(raw);
        user.role = role;
        await kvSet(`user:${emailNorm}`, JSON.stringify(user));
        return res.status(200).json({ ok: true, role });
      }

      if (action === 'deleteMes') {
        const [ano, m] = mes.split('-');
        await kvDel(`dados:${ano}:${m}`);
        const idxRaw = await kvGet('index:meses');
        const idx = Array.isArray(idxRaw) ? idxRaw : (idxRaw ? (typeof idxRaw === 'string' ? JSON.parse(idxRaw) : []) : []);
        const newIdx = idx.filter(x => x !== mes);
        await kvSet('index:meses', JSON.stringify(newIdx));
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'action inválida' });
    }

  } catch (err) {
    console.error('[admin.js]', err);
    return res.status(500).json({ error: err.message });
  }
}

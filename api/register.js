// ============================================================
//  ÁLAMO ANALYTICS — Cadastro de Usuário
//  Arquivo: api/register.js
//
//  Cria usuário com status "pending"
//  Admin precisa aprovar para liberar acesso
// ============================================================

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvSet(key, value) {
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
  return r.json();
}

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

// Hash simples (sem bcrypt para não precisar de npm)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + process.env.JWT_SECRET);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    // Valida email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // Valida senha (mín. 6 caracteres)
    if (senha.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
    }

    const emailNorm = email.toLowerCase().trim();
    const key = `user:${emailNorm}`;

    // Verifica se já existe
    const existing = await kvGet(key);
    if (existing) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const hash = await hashPassword(senha);
    const user = {
      nome: nome.trim(),
      email: emailNorm,
      senha: hash,
      status: 'pending', // pending | active | blocked
      role: 'viewer',    // viewer | uploader | admin
      createdAt: new Date().toISOString()
    };

    await kvSet(key, JSON.stringify(user));

    // Adiciona ao índice de usuários
    const idxRaw = await kvGet('index:users');
    const idx = idxRaw ? JSON.parse(idxRaw) : [];
    if (!idx.includes(emailNorm)) {
      idx.push(emailNorm);
      await kvSet('index:users', JSON.stringify(idx));
    }

    return res.status(201).json({
      ok: true,
      message: 'Cadastro realizado! Aguarde a aprovação do administrador.'
    });

  } catch (err) {
    console.error('[register.js]', err);
    return res.status(500).json({ error: err.message });
  }
}

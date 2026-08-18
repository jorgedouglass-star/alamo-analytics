// ============================================================
//  ÁLAMO ANALYTICS — Endpoint de Dados
//  Arquivo: api/data.js
//
//  Retorna todos os dados consolidados do Upstash Redis
//  O dashboard consome este endpoint em vez do Google Sheets
// ============================================================

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

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

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const pad = (s) => s + '='.repeat((4 - s.length % 4) % 4);
    const data = JSON.parse(Buffer.from(pad(parts[1]), 'base64').toString('utf-8'));
    if (data.exp < Date.now() / 1000) return null;
    return data;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Não autenticado' });

  try {
    // Lê índice de meses disponíveis
    const idxRaw = await kvGet('index:meses');
    const meses = Array.isArray(idxRaw) ? idxRaw : (idxRaw ? (typeof idxRaw === 'string' ? JSON.parse(idxRaw) : []) : []);

    if (!meses.length) {
      return res.status(200).json({ rows: [], meses: [] });
    }

    // Carrega dados — suporta formato anual ("2026") e mensal ("2026-01")
    const chunks = await Promise.all(
      meses.map(async (m) => {
        let raw;
        if (m.includes('-')) {
          // Formato mensal: "2026-01" → chave dados:2026:01
          const [ano, mes] = m.split('-');
          raw = await kvGet(`dados:${ano}:${mes}`);
        } else {
          // Formato anual: "2026" → chave dados:2026
          raw = await kvGet(`dados:${m}`);
        }
        if (!raw) return [];
        return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
      })
    );

    const rows = chunks.flat();

    // Cache por 5 minutos
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ rows, meses });

  } catch (err) {
    console.error('[data.js]', err);
    return res.status(500).json({ error: err.message });
  }
}

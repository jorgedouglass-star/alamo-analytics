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
  return d.result;
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
    const meses = idxRaw ? JSON.parse(idxRaw) : [];

    if (!meses.length) {
      return res.status(200).json({ rows: [], meses: [] });
    }

    // Carrega dados de cada mês em paralelo
    const chunks = await Promise.all(
      meses.map(async (m) => {
        const [ano, mes] = m.split('-');
        const raw = await kvGet(`dados:${ano}:${mes}`);
        return raw ? JSON.parse(raw) : [];
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

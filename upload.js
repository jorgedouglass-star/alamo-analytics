// ============================================================
//  ÁLAMO ANALYTICS — Upload de Arquivo de Dados
//  Arquivo: api/upload.js
//
//  Recebe um arquivo CSV ou XLS no formato mm_aaaa
//  Parseia os dados e salva no Upstash Redis
//  Se o arquivo do mesmo mês já existir, substitui
//
//  Colunas esperadas (igual à planilha atual):
//  EMPRESA, FATURA, CNPJ CLIENTE, CLIENTE.1, DATA EMISSÃO,
//  DATA VCTO, NFS-E, PONTO APOIO NFS-E, VLR PARCELA,
//  Invoice - Nome do Diário, CRIADO POR, PRODUTO, HISTÓRICO
// ============================================================

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvSet(key, value) {
  // Upstash REST: POST /set/key com body sendo o valor como string
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${KV_TOKEN}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify(value) // value já é string JSON
  });
  return r.json();
}

async function kvGet(key) {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  // Upstash retorna { result: valor } onde valor pode ser string ou null
  const raw = d.result;
  if (!raw) return null;
  // Se já é objeto/array retorna direto, se é string tenta parsear
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

async function kvKeys(pattern) {
  const r = await fetch(`${KV_URL}/keys/${encodeURIComponent(pattern)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const d = await r.json();
  return d.result || [];
}

// Verifica JWT simples
function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    // Pad base64 if needed
    const pad = (s) => s + '='.repeat((4 - s.length % 4) % 4);
    const data = JSON.parse(Buffer.from(pad(parts[1]), 'base64').toString('utf-8'));
    if (data.exp < Date.now() / 1000) return null;
    return data;
  } catch { return null; }
}

// Parseia CSV simples
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

function parseDate(s) {
  if (!s) return null;
  s = s.toString().trim().replace(/["']/g, '');
  // DD/MM/YYYY
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    let y = parseInt(br[3]);
    if (y < 100) y += 2000;
    return { day: parseInt(br[1]), month: parseInt(br[2]), year: y };
  }
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { day: parseInt(iso[3]), month: parseInt(iso[2]), year: parseInt(iso[1]) };
  // Excel serial
  const serial = parseFloat(s);
  if (!isNaN(serial) && serial > 40000) {
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
  }
  return null;
}

function findCol(headers, candidates) {
  for (const c of candidates) {
    const i = headers.findIndex(h => h.toUpperCase().includes(c.toUpperCase()));
    if (i >= 0) return i;
  }
  return -1;
}

function processRows(rows) {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const cEmp   = findCol(headers, ['EMPRESA']);
  const cCli   = findCol(headers, ['CLIENTE.1', 'CLIENTE']);
  const cDate  = findCol(headers, ['EMISSÃO', 'EMISSAO', 'DATA EMISS']);
  const cVcto  = findCol(headers, ['VCTO', 'VENCIMENTO', 'DATA VCTO']);
  const cVal   = findCol(headers, ['VLR PARCELA', 'VALOR', 'VLR']);
  const cProd  = findCol(headers, ['PRODUTO']);
  const cCri   = findCol(headers, ['CRIADO POR', 'CRIADO']);
  const cFat   = findCol(headers, ['FATURA']);

  const processed = [];
  for (const row of rows) {
    const vals = Object.values(row);
    // Detecta formato: se tem ponto E vírgula = BR (1.234,56), senão = padrão (1234.56)
    const rawVal = (vals[cVal] || '').toString().trim().replace(/[R$\s]/g, '');
    let valStr;
    if (rawVal.includes(',') && rawVal.includes('.')) {
      // Formato BR: 1.234,56 → remove ponto de milhar, troca vírgula por ponto
      valStr = rawVal.replace(/\./g, '').replace(',', '.');
    } else if (rawVal.includes(',')) {
      // Só vírgula: 1234,56 → troca por ponto
      valStr = rawVal.replace(',', '.');
    } else {
      // Já em formato padrão: 1234.56
      valStr = rawVal;
    }
    const valor = parseFloat(valStr);
    if (!valor || valor <= 0) continue;
    const dt = parseDate(vals[cDate]);
    if (!dt) continue;
    const vtDt = parseDate(vals[cVcto]);
    const prazo = vtDt ? (vtDt.year * 365 + vtDt.month * 30 + vtDt.day) - (dt.year * 365 + dt.month * 30 + dt.day) : null;
    processed.push({
      empresa:  (vals[cEmp]  || '').trim(),
      cliente:  (vals[cCli]  || '').trim(),
      fatura:   (vals[cFat]  || '').trim(),
      produto:  (vals[cProd] || '').trim(),
      criado:   (vals[cCri]  || '').trim(),
      valor,
      year:     dt.year,
      month:    dt.month,
      prazo:    prazo !== null && prazo >= 0 && prazo <= 400 ? prazo : null,
      vctoRaw:  vals[cVcto] || ''
    });
  }
  return processed;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  // Autenticação
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const { filename, content, contentType } = req.body;
    if (!filename || !content) return res.status(400).json({ error: 'filename e content obrigatórios' });

    // Valida nome: mm_aaaa.csv ou mm_aaaa.xls
    const match = filename.match(/^(\d{2})_(\d{4})\.(csv|xls|xlsx)$/i);
    if (!match) return res.status(400).json({ error: 'Nome inválido. Use o formato mm_aaaa.csv (ex: 01_2026.csv)' });

    const mes = match[1], ano = match[2];
    const key = `dados:${ano}:${mes}`;

    // Parseia conteúdo
    let rows = [];
    if (contentType === 'csv' || filename.toLowerCase().endsWith('.csv')) {
      // content é texto CSV em base64 ou direto
      const text = content.startsWith('data:') 
        ? Buffer.from(content.split(',')[1], 'base64').toString('utf-8')
        : Buffer.from(content, 'base64').toString('utf-8');
      rows = parseCSV(text);
    } else {
      return res.status(400).json({ error: 'Por ora aceite apenas CSV. XLS: salve como CSV antes de importar.' });
    }

    if (!rows.length) return res.status(400).json({ error: 'Arquivo vazio ou sem dados válidos' });

    const processed = processRows(rows);
    if (!processed.length) return res.status(400).json({ error: 'Nenhuma linha válida encontrada. Verifique o formato.' });

    // Salva no Upstash (sobrescreve se já existia)
    await kvSet(key, JSON.stringify(processed));

    // Atualiza índice de meses disponíveis
    const idxRaw = await kvGet('index:meses');
    let idx = [];
    if (Array.isArray(idxRaw)) idx = idxRaw;
    else if (typeof idxRaw === 'string') {
      try { idx = JSON.parse(idxRaw); } catch { idx = []; }
    }
    if (!Array.isArray(idx)) idx = [];
    const entry = `${ano}-${mes}`;
    if (!idx.includes(entry)) {
      idx.push(entry);
      idx.sort();
    }
    await kvSet('index:meses', JSON.stringify(idx));

    return res.status(200).json({
      ok: true,
      mes: `${mes}/${ano}`,
      registros: processed.length,
      key,
      message: `${processed.length} registros importados para ${mes}/${ano}`
    });

  } catch (err) {
    console.error('[upload.js]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
//  ÁLAMO ANALYTICS — Proxy de IA (Vercel Serverless Function)
//  Arquivo: api/chat.js
//
//  Configure no painel do Vercel em:
//  Settings → Environment Variables
//
//  Variáveis obrigatórias:
//    AI_PROVIDER   → groq | anthropic | openai
//
//  Variáveis por provedor (adicione apenas o que for usar):
//    GROQ_API_KEY        → chave do Groq      (gsk_...)
//    ANTHROPIC_API_KEY   → chave da Anthropic  (sk-ant-...)
//    OPENAI_API_KEY      → chave da OpenAI     (sk-...)
//
//  Modelos usados automaticamente por provedor:
//    Groq      → llama-3.3-70b-versatile  (gratuito)
//    Anthropic → claude-haiku-4-5-20251001 (mais barato)
//    OpenAI    → gpt-4o-mini              (mais barato)
// ============================================================

export default async function handler(req, res) {

  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  // --- Ler configuração do Vercel ---
  const provider  = (process.env.AI_PROVIDER || 'groq').toLowerCase().trim();
  const { messages, system, max_tokens = 1000 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Campo "messages" ausente ou inválido' });
  }

  try {
    let reply;

    // ── GROQ ─────────────────────────────────────────────────
    if (provider === 'groq') {
      const key = process.env.GROQ_API_KEY;
      if (!key) throw new Error('Variável GROQ_API_KEY não configurada no Vercel');

      const msgs = system
        ? [{ role: 'system', content: system }, ...messages]
        : messages;

      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: msgs,
          max_tokens,
          temperature: 0.4
        })
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || `Groq: erro ${r.status}`);
      reply = data.choices?.[0]?.message?.content || '';
    }

    // ── ANTHROPIC ─────────────────────────────────────────────
    else if (provider === 'anthropic') {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('Variável ANTHROPIC_API_KEY não configurada no Vercel');

      const body = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens,
        messages
      };
      if (system) body.system = system;

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || `Anthropic: erro ${r.status}`);
      reply = data.content?.[0]?.text || '';
    }

    // ── OPENAI ────────────────────────────────────────────────
    else if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('Variável OPENAI_API_KEY não configurada no Vercel');

      const msgs = system
        ? [{ role: 'system', content: system }, ...messages]
        : messages;

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: msgs,
          max_tokens,
          temperature: 0.4
        })
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || `OpenAI: erro ${r.status}`);
      reply = data.choices?.[0]?.message?.content || '';
    }

    // ── PROVEDOR NÃO RECONHECIDO ──────────────────────────────
    else {
      throw new Error(`Provedor "${provider}" não suportado. Use: groq | anthropic | openai`);
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('[chat.js]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

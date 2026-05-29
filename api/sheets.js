// ============================================================
//  ÁLAMO ANALYTICS — Proxy do Google Sheets
//  Arquivo: api/sheets.js
//
//  Busca o CSV da planilha pelo servidor do Vercel,
//  evitando bloqueios de CORS no navegador.
//
//  Cache de 1 hora: se várias pessoas abrirem o dashboard
//  ao mesmo tempo, o Vercel serve a versão em cache
//  sem sobrecarregar o Google Sheets.
//
//  Para trocar a planilha: altere apenas a constante
//  SHEET_URL abaixo com o novo link CSV publicado.
// ============================================================

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/e/' +
  '2PACX-1vTmauedPdcFkHXieVEt4-pNlWlTfdGDq9R0ikYu2KpPXTFotEVE7Pau1UXnWOnBQA/' +
  'pub?gid=817431800&single=true&output=csv';

export default async function handler(req, res) {

  // Apenas GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const response = await fetch(SHEET_URL, {
      headers: { 'Accept': 'text/csv' }
    });

    if (!response.ok) {
      throw new Error(`Google Sheets retornou HTTP ${response.status}`);
    }

    const csv = await response.text();

    if (!csv || csv.trim().length === 0) {
      throw new Error('Planilha retornou vazia. Verifique se está publicada.');
    }

    // Sem cache: sempre busca dados frescos do Google Sheets
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).send(csv);

  } catch (err) {
    console.error('[sheets.js]', err.message);
    return res.status(500).json({
      error: err.message,
      dica: 'Verifique se a planilha está publicada em: Arquivo → Compartilhar → Publicar na web → CSV'
    });
  }
}

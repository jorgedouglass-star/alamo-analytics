// ============================================================
//  ÁLAMO ANALYTICS — Autenticação
//  Arquivo: api/auth.js
//
//  Recebe a senha do formulário de login, valida contra
//  a variável de ambiente DASHBOARD_PASSWORD e,
//  se correta, define um cookie de sessão seguro.
//
//  Configure no Vercel:
//    Settings → Environment Variables
//    DASHBOARD_PASSWORD = a senha que você escolher
// ============================================================

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Lê a senha do formulário
  let body = '';
  await new Promise((resolve) => {
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', resolve);
  });

  const params  = new URLSearchParams(body);
  const senha   = params.get('password') || '';
  const correta = process.env.DASHBOARD_PASSWORD || '';

  if (!correta) {
    // Variável não configurada no Vercel
    return res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0D2040;color:#fff">
        <h2>⚠️ Configuração pendente</h2>
        <p>A variável <strong>DASHBOARD_PASSWORD</strong> não foi definida no Vercel.</p>
        <p>Vá em: <strong>Settings → Environment Variables</strong> e adicione a senha.</p>
      </body></html>
    `);
  }

  if (senha === correta) {
    // Senha correta → cria cookie de sessão (7 dias)
    const token   = Buffer.from(correta).toString('base64');
    const maxAge  = 60 * 60 * 24 * 7; // 7 dias em segundos

    res.setHeader('Set-Cookie',
      `alamo_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
    );
    res.setHeader('Location', '/');
    return res.status(302).end();

  } else {
    // Senha errada → volta para login com flag de erro
    res.setHeader('Location', '/login.html?erro=1');
    return res.status(302).end();
  }
}

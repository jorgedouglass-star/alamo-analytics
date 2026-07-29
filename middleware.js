// ============================================================
//  ÁLAMO ANALYTICS — Middleware de Autenticação (JWT)
//  Arquivo: middleware.js
//
//  Protege todas as rotas exceto login, register e api pública
//  Usuário autenticado via token JWT no cookie ou localStorage
// ============================================================

export const config = {
  matcher: ['/((?!login\\.html|register\\.html|api/login|api/register|favicon\\.ico).*)']
};

export default function middleware(request) {
  const url = new URL(request.url);

  // Rotas liberadas
  const liberadas = ['/login.html', '/register.html', '/api/login', '/api/register'];
  if (liberadas.some(r => url.pathname.startsWith(r))) return;

  // Rota admin só para ADMIN_EMAIL
  // A verificação real é feita no api/admin.js
  // Aqui só verificamos se há token no cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenMatch = cookieHeader.match(/alamo_token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (!token) {
    return Response.redirect(new URL('/login.html', request.url), 302);
  }

  // Verifica expiração básica do JWT
  try {
    const payload = token.split('.')[1];
    const data = JSON.parse(atob(payload));
    if (data.exp < Date.now() / 1000) {
      return Response.redirect(new URL('/login.html?expired=1', request.url), 302);
    }
  } catch {
    return Response.redirect(new URL('/login.html', request.url), 302);
  }
}

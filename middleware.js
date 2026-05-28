// ============================================================
//  ÁLAMO ANALYTICS — Middleware de Autenticação
//  Arquivo: middleware.js  (na raiz do projeto)
//
//  Intercepta TODAS as requisições antes de servir
//  qualquer arquivo. Se o cookie de sessão não existir
//  ou for inválido, redireciona para /login.html
//
//  Rotas liberadas sem autenticação:
//    /login.html   — tela de login
//    /api/auth     — endpoint que valida a senha
// ============================================================

export const config = {
  matcher: [
    // Protege tudo, exceto login e autenticação
    '/((?!login\\.html|api/auth|favicon\\.ico).*)'
  ]
};

export default function middleware(request) {
  const url = new URL(request.url);

  // Rotas que não precisam de autenticação
  const liberadas = ['/login.html', '/api/auth'];
  if (liberadas.some(r => url.pathname.startsWith(r))) {
    return; // Passa sem verificar
  }

  // Lê o cookie de sessão
  const cookieHeader = request.headers.get('cookie') || '';
  const match        = cookieHeader.match(/alamo_session=([^;]+)/);
  const token        = match ? match[1] : null;

  // Valida o token contra a senha configurada
  const senha    = process.env.DASHBOARD_PASSWORD || '';
  const esperado = btoa(senha);

  if (!token || token !== esperado) {
    // Sem sessão válida → redireciona para login
    return Response.redirect(new URL('/login.html', request.url), 302);
  }

  // Sessão válida → permite o acesso
  // (não retornar nada = passar para o próximo handler)
}

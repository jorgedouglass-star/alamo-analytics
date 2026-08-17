# Álamo Analytics — Guia para Claude Code

## O que é este projeto
Dashboard de inteligência de receita para Álamo Intermodal Logistics (Santos, SP).
Stack: HTML/JS/CSS vanilla + Vercel Serverless Functions + Upstash Redis.

## Estrutura do projeto
```
/
├── index.html          # Dashboard principal (2600+ linhas)
├── login.html          # Tela de login (email + senha)
├── register.html       # Cadastro de novos usuários
├── admin.html          # Painel admin (aprovação de usuários)
├── middleware.js        # Proteção de rotas via JWT (Vercel Edge)
├── CLAUDE.md           # Este arquivo
└── api/
    ├── upload.js       # Importação de CSV mensal → Upstash
    ├── data.js         # Serve dados consolidados para o dashboard
    ├── login.js        # Autenticação email+senha → JWT
    ├── register.js     # Cadastro de usuários
    ├── admin.js        # Gerenciamento de usuários e dados
    └── chat.js         # Proxy IA (Groq/Anthropic/OpenAI)
```

## Variáveis de ambiente (Vercel)
```
KV_REST_API_URL         # URL do Upstash Redis (auto-configurada)
KV_REST_API_TOKEN       # Token do Upstash Redis (auto-configurada)
JWT_SECRET              # Segredo para assinar tokens JWT
ADMIN_EMAIL             # Email do administrador principal
AI_PROVIDER             # groq | anthropic | openai
GROQ_API_KEY            # Chave do Groq (se AI_PROVIDER=groq)
ANTHROPIC_API_KEY       # Chave da Anthropic (se AI_PROVIDER=anthropic)
```

## Deploy
- Repositório: https://github.com/jorgedouglass-star/alamo-analytics
- Hospedagem: Vercel (auto-deploy a cada push na branch main)
- Banco: Upstash Redis REST API

## Como funciona o upload de dados
1. Usuário clica em "Importar" no dashboard
2. Seleciona arquivo `mm_aaaa.csv` (ex: `05_2026.csv`)
3. Frontend lê o arquivo e envia base64 para `api/upload.js`
4. `upload.js` parseia o CSV e salva no Upstash com chave `dados:2026:05`
5. Atualiza `index:meses` com a lista de meses disponíveis
6. Dashboard recarrega chamando `api/data.js`

## Formato do CSV esperado
Colunas obrigatórias: `EMPRESA`, `CLIENTE.1`, `DATA EMISSÃO`, `VLR PARCELA`
Colunas opcionais: `DATA VCTO`, `PRODUTO`, `CRIADO POR`, `FATURA`
Valores numéricos: ponto como decimal (ex: `6113.25`) — gerado pelo pandas

## Autenticação
- JWT salvo no localStorage + cookie `alamo_token`
- Expiração: 7 dias
- Roles: `viewer` (só lê), `uploader` (importa dados), `admin` (tudo)
- Aprovação manual pelo admin em `/admin.html`

## Padrões de código
- Sem framework — vanilla JS puro
- Sem build step — arquivos servidos diretamente pelo Vercel
- CSS via variáveis CSS (`--card`, `--txt`, `--or`, etc.) para dark/light mode
- Charts: Chart.js via CDN
- Ícones: Tabler Icons via CDN

## Comandos úteis para Claude Code
```bash
# Ver logs do Vercel em tempo real
vercel logs --follow

# Deploy manual
vercel --prod

# Ver variáveis de ambiente
vercel env ls

# Testar endpoint localmente
vercel dev
```

## Principais funções do dashboard (index.html)
- `loadData()` — busca dados de `/api/data` e chama `buildAggregates()`
- `buildAggregates(raw)` — processa dados brutos, popula CLIENTS, PRODS, EMPDATA, PRAZO_DATA
- `renderOverview()` — renderiza aba Visão Geral com KPIs e gráficos
- `renderClientes()` — ranking de clientes + score de saúde RFV
- `renderPrazos()` — análise de prazos concedidos por cliente
- `renderOperacional()` — desempenho da equipe de faturamento
- `startBriefing()` — modo apresentação executiva (13 slides)
- `exportPDF()` — relatório executivo em PDF via jsPDF

## Telas principais
- **Visão Geral**: KPIs + gauge de meta + forecast 3 meses + evolução mensal
- **Clientes**: ranking + score de saúde RFV (Saudável/Atenção/Risco)
- **Produtos**: mix de serviços + evolução por produto
- **Prazos**: prazo médio concedido por cliente + variação 2025→2026
- **Operacional**: desempenho da equipe de faturamento
- **IA + Chat**: chat com contexto dos dados via Groq/Anthropic

## Notas importantes
- O `kvGet` do Upstash já retorna objetos parseados — NÃO fazer JSON.parse() duplo
- JWT usa Buffer.from() (Node.js) — NÃO usar btoa()/atob() (browser-only)
- Filtros de ano/mês/empresa devem propagar para TODAS as telas
- Meses futuros além do atual devem ser filtrados nos dados

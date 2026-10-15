# Desenvolvimento

## Requisitos

- **Node.js 24.** O servidor usa `node:sqlite`, que vem nessa versão; `package.json` exige `>=24 <25`.
- npm (o `package-lock.json` fixa as versões; prefira `npm ci`).
- Para os testes de navegador: `npx playwright install webkit`.

No Windows/PowerShell, se a política do computador bloquear `npm.ps1`, use `npm.cmd` e `npx.cmd` em todos os comandos.

## Primeira execução

```sh
npm ci
cp .env.example .env
npm run account:setup
npm run dev
```

- `account:setup` pede e-mail e senha (mínimo de 12 caracteres) sem mostrar a senha, e grava a conta no banco **local**.
- `npm run dev` sobe a API (porta 3001, com recarga) e o Vite (porta 5173), que repassa `/api` para a API.
- Abra http://localhost:5173.

### Testar como app instalável e offline

O service worker só funciona no build de produção:

```sh
npm run build
APP_ORIGIN=http://localhost:3001 npm start       # PowerShell: $env:APP_ORIGIN='http://localhost:3001'; npm.cmd start
```

Abra http://localhost:3001. Em `localhost` o navegador permite service worker sem HTTPS. Para testar no celular, é preciso um endereço HTTPS público.

## Variáveis de ambiente

O servidor lê o `.env` da raiz (via `dotenv`).

| Variável | Padrão | Uso |
|---|---|---|
| `HOST` | `127.0.0.1` | Interface onde a API escuta (`0.0.0.0` no contêiner) |
| `PORT` | `3001` | Porta da API |
| `APP_ORIGIN` | `http://localhost:5173` | Origem aceita nas escritas. Em produção precisa ser `https://` |
| `DATA_DIR` | `.data` | Pasta do banco `travel.db` |
| `BACKUP_DIR` | `<DATA_DIR>/backups` | Pasta dos backups |
| `NODE_ENV` | — | `production` liga cookie `Secure`, HSTS e backup automático |
| `APP_HOST` | — | Só para o `docker compose`: domínio público (veja [DEPLOYMENT.md](../DEPLOYMENT.md)) |

## Testes

```sh
npm test            # lógica, API, backup, restauração e sincronização
npm run build       # obrigatório antes do e2e: o servidor de teste serve o dist/
npm run test:e2e    # jornadas no WebKit com perfil de iPhone
```

- **`npm test`** (`tests/*.test.ts`): dinheiro e totais, validação, CSV, gráfico, máscara de valores, rotas da API, sessões, limite de login, idempotência, migração de banco antigo, backup e restauração, e dois "aparelhos" IndexedDB sincronizando com rede instável.
- **`npm run test:e2e`** (`tests/browser/`): sobe um servidor descartável com banco em memória e conta fictícia (`tests/start-e2e.ts`). Percorre orçamento, offline, fechar e reabrir, edição, filtros, exclusão, CSV, conflito entre dois contextos de navegador, ticket, gráfico, ocultar valores e a tela de entrada. As capturas de tela vão para `.local/` (ignorada pelo Git).
- O `npm run build` também checa os tipos dos testes.

### Cuidados

- **Limite de login:** o servidor aceita 10 logins a cada 15 minutos, e cada jornada faz um ou dois. Ao repetir os testes, use no máximo `--repeat-each=3`. Acima disso as últimas execuções falham na tela de login, e não é defeito do app.
- **Navegador:** os testes usam WebKit no computador, que não reproduz todos os controles nativos do Safari do iPhone, como o campo de data. Confira mudanças de layout num iPhone de verdade.
- **Espera por sincronização:** o texto "Tudo sincronizado" pode aparecer antes de uma sincronização começar. Para garantir que algo chegou ao servidor, consulte `/api/trip` com `expect.poll`, como faz `tests/browser/travel.spec.ts`.

## Migrações do banco

As migrações ficam na lista `migrations` em `server/db.ts`, são aplicadas na inicialização e registradas em `schema_migrations`.

- Nunca edite uma migração já aplicada: acrescente uma nova com o próximo número.
- Prefira mudanças que só acrescentam (novas colunas com valor padrão), para que operações antigas guardadas na fila dos aparelhos continuem válidas.
- Teste a migração a partir de um banco da versão anterior, como em `tests/server.test.ts`.

## Convenções

- Dinheiro sempre em centavos inteiros; formate só na exibição (`money`, `shownMoney`, `<Amount>`).
- Toda exibição de valor na tela passa por `<Amount>` ou `show()`, para respeitar o modo "ocultar valores".
- Datas como texto `AAAA-MM-DD` no fuso de Brasília.
- Regras de negócio novas entram em `shared/model.ts`, com teste em `tests/model.test.ts`.
- Textos da interface em português, sem caixa alta decorativa.
- Cores só pelos tokens do topo de `src/styles.css` (veja [design.md](design.md)).

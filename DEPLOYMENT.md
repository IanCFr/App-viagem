# Publicação

Guia para publicar o app numa VPS Linux com Docker, atrás de um proxy reverso com HTTPS. O `compose.yaml` traz labels prontas para o **Traefik** com emissor Let's Encrypt chamado `letsencrypt`; com outro proxy, aponte-o para `127.0.0.1:3107`.

> Não há endereço fixo no código. O domínio público vem da variável `APP_HOST`, definida num arquivo `.env` ao lado do `compose.yaml`, que nunca vai para o Git.

## 1. Antes de instalar

Confira o que já existe no servidor, para não atrapalhar outros serviços:

```sh
cat /etc/os-release
docker ps
docker compose version
ss -ltnp
df -h
```

- Identifique quem atende as portas 80 e 443 e confirme que a porta local 3107 está livre.
- O app publica apenas em `127.0.0.1:3107`, sem exposição direta à internet.
- Não reinstale o proxy nem substitua configurações globais.

Sem domínio próprio, um serviço como o `sslip.io` resolve um nome que embute o IP (ex.: `viagem.203-0-113-10.sslip.io`), sem cadastro.

## 2. Enviar o código e configurar o domínio

Copie o código para `/opt/app-viagem`, **sem** `.local/`, `.data/`, `.env`, `node_modules/`, backups e resultados de teste. Uma forma é empacotar uma lista explícita:

```sh
tar -czf app-viagem.tar.gz package.json package-lock.json tsconfig.json vite.config.ts index.html \
  src server shared public scripts tests Dockerfile compose.yaml .dockerignore \
  playwright.config.ts .env.example .gitignore README.md DEPLOYMENT.md docs LICENSE
```

No servidor, crie o `.env` com o domínio (uma vez só; atualizações não o sobrescrevem):

```sh
cd /opt/app-viagem
echo 'APP_HOST=viagem.exemplo.com' > .env
```

Sem `APP_HOST`, o `docker compose` para com uma mensagem clara e não mexe no contêiner em execução.

> Escolha o domínio antes do primeiro uso. Trocar de endereço depois faz os celulares perderem as pendências offline, que ficam presas à origem antiga.

## 3. Construir e criar a conta

```sh
cd /opt/app-viagem
docker compose build
docker compose run --rm app npm run account:setup
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3107/api/health
```

O assistente pede e-mail e senha (mínimo de 12 caracteres), sem mostrar a senha. Não existe senha padrão. O e-mail é só o identificador da conta; nenhum e-mail é enviado.

## 4. HTTPS

Com o Traefik em execução, o contêiner já se anuncia com as labels do `compose.yaml`: roteador `app-viagem`, entrada `websecure`, emissor `letsencrypt` e porta interna 3001. Não é preciso editar nem reiniciar o Traefik. O redirecionamento de HTTP para HTTPS fica a cargo do proxy.

Verifique, sem ignorar erros de certificado:

```sh
curl --fail https://viagem.exemplo.com/api/health
curl -I https://viagem.exemplo.com/
docker compose logs --tail=50 app
```

Confirme também que os serviços que já existiam continuam respondendo.

## 5. Backup

Em produção, o app faz um backup ao iniciar e a cada 24 horas, guardando as 14 cópias mais recentes em `/data/backups`. A cópia usa a API de backup do SQLite e é consistente mesmo com o banco em uso.

```sh
docker compose exec app npm run backup
docker compose exec app ls -lt /data/backups
```

Guarde cópias **fora da VPS**: as automáticas ficam no mesmo volume e não protegem contra perda do servidor. Por exemplo, `docker compose cp app:/data/backups ./backups` e depois transfira a pasta para outro computador. Backups contêm os gastos e o hash da senha: mantenha-os privados.

### Restaurar

Abra o app nos celulares com internet e sincronize antes. Depois, pare só este serviço:

```sh
cd /opt/app-viagem
docker compose stop app
docker compose run --rm app npm run restore -- /data/backups/NOME-DO-BACKUP.db --server-stopped
docker compose up -d app
```

A restauração confere a integridade e guarda o banco anterior como `travel.db.before-restore-*`. Ela também encerra as sessões, então será preciso entrar de novo nos aparelhos. Alterações feitas depois do backup não estão na cópia. Nunca copie o `.db` à mão com o app rodando.

## 6. Atualizar

Faça um backup e guarde a imagem atual antes:

```sh
cd /opt/app-viagem
docker compose exec app npm run backup
docker image tag app-viagem:local app-viagem:previous
# envie o código novo (o .env do servidor é preservado)
docker compose build
docker compose up -d app
docker compose ps
```

As migrações do banco rodam sozinhas na inicialização. O volume `app-viagem_travel-data` é preservado: **nunca use `docker compose down -v`**.

Para voltar à versão anterior:

```sh
docker image tag app-viagem:previous app-viagem:local
docker compose up -d --no-build app
```

Se a versão nova tiver aplicado uma migração incompatível, restaure também o backup feito antes da atualização.

Depois de publicar, os celulares mostram "Uma atualização está pronta" e atualizam com um toque.

## 7. Redefinir a conta

Para trocar e-mail ou senha, preservando os gastos:

```sh
docker compose exec app npm run account:setup
```

Todas as sessões são encerradas. Os aparelhos guardam as alterações pendentes e pedem novo login para enviá-las.

## Checklist de aceite

- [ ] HTTPS válido e `/api/health` respondendo `{"status":"ok"}`.
- [ ] Login nos dois celulares.
- [ ] Gasto registrado offline aparece no outro celular depois de reconectar, sem duplicar.
- [ ] Mesmos totais nos dois aparelhos depois de editar e excluir.
- [ ] Backup criado, healthcheck do contêiner `healthy` e dados preservados após reiniciar o app.
- [ ] Serviços que já existiam no servidor continuam funcionando.
- [ ] Acessos temporários (como chaves SSH usadas na publicação) removidos.

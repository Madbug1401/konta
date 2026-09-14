# Correr o Konta localmente no Windows

Este guia assume que já tens o Node.js instalado. Segue os passos por ordem,
no teu próprio terminal (PowerShell, ou o terminal do VS Code) — não no meu.

## 0. Porque não posso simplesmente "correr" isto por ti

Eu não tenho acesso a um terminal Windows real na tua máquina — só a uma
pasta partilhada (por isso consigo escrever/ler ficheiros aqui) e a um
ambiente auxiliar isolado, sem ligação à tua rede (já confirmámos isso com o
teste do `localhost:58123` que não abriu). Além disso, o `npm install` teria
de correr no MESMO sistema operativo onde depois vais abrir o `localhost` —
o Next.js instala binários nativos (SWC) específicos do Windows, e se eu
corresse o `npm install` no meu ambiente Linux, ficarias com binários que
não funcionam no teu PC. Por isso, os comandos abaixo têm mesmo de ser
colados por ti.

## 1. Base de dados — Docker Desktop

Se ainda não tens, instala o Docker Desktop: https://www.docker.com/products/docker-desktop
(depois de instalar, precisas de o abrir uma vez para o motor arrancar).

Dentro da pasta `konta`:

```
docker compose up -d
```

Isto cria a base de dados Postgres (utilizador `konta`, password `konta_dev_pw`,
base de dados `konta_dev`, porta 5432) — já corresponde ao `.env.example`.

Não tens de instalar o PostgreSQL nem o `psql` no Windows: os ficheiros SQL
de `prisma/manual-sql/` ficam montados dentro do contentor em `/migrations`.

## 2. Configurar e instalar o projeto

```
cd caminho\para\financialManagers\konta
copy .env.example .env
npm install
```

Abre o `.env` só para confirmar que o `DATABASE_URL` bate certo com o passo 1
(o valor de exemplo já está certo se seguiste os passos acima tal e qual).

## 3. Criar as tabelas

```
docker compose exec db psql -U konta -d konta_dev -f /migrations/0001_init.sql
docker compose exec db psql -U konta -d konta_dev -f /migrations/0002_seed_categories.sql
```

(Password não é pedida aqui porque estás a entrar através do próprio
contentor, já autenticado como o utilizador da base de dados.)

## 4. Confirmar que os testes passam

```
npm test
```

Deves ver 20 testes a passar, incluindo os 5 que reproduzem diretamente os
bugs identificados na auditoria original.

## 5. Arrancar a aplicação

```
npm run dev
```

Quando vires no terminal algo como `Ready in ...ms` e `Local: http://localhost:3000`,
abre esse endereço no teu browser. Aí sim vais ver o ecrã de login — porque desta
vez o servidor está mesmo a correr na tua máquina.

## 6. (Opcional) Recriar os dados de demonstração

Com o `npm run dev` já a correr, abre um **segundo terminal** na mesma pasta e corre:

```
node scripts/seed-demo.mjs
```

Depois entra em http://localhost:3000/login com `demo@konta.cv` / `demoSenha123`
para veres exatamente o mesmo dashboard das screenshots que te mostrei.
Se preferires começar do zero com os teus próprios dados, ignora este passo
e cria a tua conta em `/register`.

## Alternativa: PostgreSQL nativo em vez de Docker

Se preferires não usar Docker, instala o PostgreSQL a partir de
https://www.postgresql.org/download/windows/, cria o utilizador/BD:

```sql
CREATE USER konta WITH PASSWORD 'konta_dev_pw';
CREATE DATABASE konta_dev OWNER konta;
```

e no passo 3 usa o `psql` que vem com o instalador em vez do `docker compose exec`:

```
psql -h localhost -U konta -d konta_dev -f prisma/manual-sql/0001_init.sql
psql -h localhost -U konta -d konta_dev -f prisma/manual-sql/0002_seed_categories.sql
```

## Alternativa: Prisma "a sério" em vez dos SQL manuais

A tua máquina não tem o bloqueio de rede que eu tenho neste sandbox, por isso
isto provavelmente funciona sem problemas e é o caminho recomendado a prazo:

```
npx prisma generate
npx prisma db push
```

O `schema.prisma` já é a fonte de verdade — os SQL manuais foram só a forma
de contornar esse bloqueio de rede aqui no meu ambiente.

## Problemas comuns

- **"password authentication failed"** — o `DATABASE_URL` no `.env` não
  corresponde ao utilizador/password criado no passo 1.
- **Porta 5432 já em uso** — já tens outro Postgres a correr; muda a porta
  no `docker-compose.yml` (ex: `"5433:5432"`) e atualiza o `DATABASE_URL`.
- **Porta 3000 já em uso** — corre `npm run dev -- -p 3001` e abre
  `http://localhost:3001`.
- **`docker compose` não é reconhecido** — abre o Docker Desktop primeiro
  (tem de estar a correr em segundo plano) e tenta novamente.

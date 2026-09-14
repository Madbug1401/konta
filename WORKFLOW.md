# Ordem de trabalho: konta → konta-github-ready → GitHub

Este ficheiro existe só para não se perder a memória de como isto foi montado.
Fica na raiz de propósito, para aparecer sempre que se abre o projeto.

## As três pastas

```
/home/nicol/Projetos/konta/
├── konta/                # 1. TRABALHO — onde se programa e testa, sempre
├── konta-github-ready/   # 2. PROMOÇÃO — checkout limpo, portão antes do GitHub
└── docs/, etc.           #    (não existe mais fora do repo — ver nota abaixo)
```

`konta/` tem dois remotes git configurados (`git remote -v` confirma):

| remote | aponta para | uso |
|---|---|---|
| `ready` | `/home/nicol/Projetos/konta/konta-github-ready` (caminho local) | passo 2 abaixo |
| `origin` | `https://github.com/Madbug1401/konta.git` | só a partir de `konta-github-ready`, nunca daqui |

## O fluxo, passo a passo

1. **Trabalhar e testar em `konta/`** — dev server, Vitest, tudo como sempre.
   Antes de dar como pronto: `npx tsc --noEmit && npx eslint . && npx vitest run && npm run build`.
2. **Commit em `konta/`**, depois `git push ready main` — copia os commits
   para `konta-github-ready`, sem tocar no GitHub.
3. **Dentro de `konta-github-ready/`**, repetir a verificação (checkout limpo
   — garante que não há nada "que só funciona na minha máquina"):
   `npx tsc --noEmit && npm run build` (e `npm ci` se for a primeira vez ou
   o `package-lock.json` tiver mudado).
4. **Só se tudo passar**, dentro de `konta-github-ready/`: `git push origin main`.
   Este é o único passo que fala com o GitHub.

Confirmar no fim: `git rev-parse HEAD` deve dar o mesmo hash nas três pontas
(`konta`, `konta-github-ready`, `origin/main` depois de um `git fetch`).

## Porquê duas pastas e não só uma branch

Foi decisão explícita do utilizador: um portão manual e físico (pasta
separada, checkout limpo) antes de qualquer coisa chegar ao GitHub — nunca
automatizado, para ser sempre uma decisão consciente de avançar cada etapa.

## Detalhe técnico a lembrar

`konta-github-ready/` é um checkout normal (não bare), com a branch `main`
sempre ativa — por isso o passo 2 (`git push ready main`) só funciona porque
essa pasta tem `receive.denyCurrentBranch=updateInstead` configurado
(`git -C konta-github-ready config receive.denyCurrentBranch`). Isto é
config local do `.git/`, **não fica no repositório** — se `konta-github-ready`
for alguma vez apagada e reclonada, é preciso correr outra vez:

```bash
git -C /home/nicol/Projetos/konta/konta-github-ready config receive.denyCurrentBranch updateInstead
```

Também por ser checkout normal: um `git push ready main` falha se
`konta-github-ready/` tiver alterações locais por commitar (proteção do
próprio git contra sobrescrever trabalho não guardado) — deve estar sempre
limpa entre promoções.

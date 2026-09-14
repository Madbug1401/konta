# Índice de documentação — Konta

Ponto de entrada. Cada pasta agrupa um tipo de documento; dentro delas, cada ficheiro é independente.

## Estado atual

- **[STATUS.md](STATUS.md)** — retrato honesto do que existe hoje no repositório, com referências a ficheiros reais. Ponto de partida para qualquer sessão nova.

## `architecture/` — como o sistema é e porquê

- **[OVERVIEW.md](architecture/OVERVIEW.md)** — visão geral da arquitetura e estrutura de pastas.
- **[DECISIONS.md](architecture/DECISIONS.md)** — ADR resumido: decisões de arquitetura e porquê.
- **[MIGRATION.md](architecture/MIGRATION.md)** — migração do protótipo (`design/prototipo-localstorage.html`) para o Konta real.
- **[DELETE_POLICY.md](architecture/DELETE_POLICY.md)** — política de eliminação de dados (ON DELETE).
- **[BACKUP.md](architecture/BACKUP.md)** — estratégia de backup e recuperação.
- **[DEPLOYMENT.md](architecture/DEPLOYMENT.md)** — deployment (Oracle Cloud Always Free).

## `operations/` — como operar em produção

- **[RENDER-NEON.md](operations/RENDER-NEON.md)** — guia de deploy zero-custo (Render + Neon).
- **[ORACLE-CLOUD.md](operations/ORACLE-CLOUD.md)** — guia de deploy na Oracle Cloud Always Free.
- **[PRODUCTION-RUNBOOK.md](operations/PRODUCTION-RUNBOOK.md)** — runbook do dia-a-dia em produção.
- **[WINDOWS_SETUP.md](operations/WINDOWS_SETUP.md)** — guia validado de setup do zero no Windows/WSL.

## `audits/` — relatórios pontuais (datados, ponto-no-tempo)

Histórico cronológico de auditorias — cada um reflete o estado do produto na data indicada, não o estado atual (esse é o `STATUS.md`).

- **[GO_TO_BETA_AUDIT.md](audits/GO_TO_BETA_AUDIT.md)** (29/08) — auditoria inicial "o que pode correr mal com utilizadores reais".
- **[KONTA_BETA_GATE.md](audits/KONTA_BETA_GATE.md)** (29/08) — plano de hardening a partir do audit anterior.
- **[ORACLE_DEPLOYMENT_READINESS.md](audits/ORACLE_DEPLOYMENT_READINESS.md)** (29/08) — preparação para deploy na Oracle Cloud.
- **[ZERO_COST_DEPLOYMENT_AUDIT.md](audits/ZERO_COST_DEPLOYMENT_AUDIT.md)** (29/08) — análise do caminho de deploy a custo zero.
- **[UX_PACKAGE_QA_REPORT.md](audits/UX_PACKAGE_QA_REPORT.md)** (30/08) — QA do pacote de UX pós-auditoria.
- **[Auditoria_Gestor_Financeiro.pdf](audits/Auditoria_Gestor_Financeiro.pdf)** / **[.docx](audits/Auditoria_Gestor_Financeiro.docx)** (25/08) — auditoria inicial do produto, formato documento.

## `design/` — mockups e especificações visuais

- **[konta-ai-design.html](design/konta-ai-design.html)** — especificação fechada do Konta AI (referenciada em `architecture/OVERVIEW.md`).
- **[konta-ai-design-draft.html](design/konta-ai-design-draft.html)** — rascunho anterior à versão fechada acima.
- **[prototipo-localstorage.html](design/prototipo-localstorage.html)** — protótipo original (pré-Konta), guardava tudo em `localStorage` (ver `architecture/MIGRATION.md`).

## `fixtures/` — ficheiros de apoio a testes manuais

- **[extrato_bancario_ficticio.pdf](fixtures/extrato_bancario_ficticio.pdf)** — extrato bancário fictício, para testar a importação de anexos pelo Konta AI.

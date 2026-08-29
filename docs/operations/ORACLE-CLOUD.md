# Konta — Guia de deploy na Oracle Cloud Always Free (orçamento $0)

Guia passo a passo para colocar o Konta a correr numa VM Oracle Cloud
Always Free, escrito assumindo que a máquina de desenvolvimento é
**Windows** (a VM em si é Linux — Ubuntu — mas nada precisa de correr Linux
localmente). Cobre exatamente os 18 passos pedidos na preparação de
deploy, do zero (criar a VM) até à Beta a receber tráfego real com HTTPS.

Este documento assume que já leste `docs/architecture/DEPLOYMENT.md`
(a decisão de hosting e o raciocínio) e `docs/architecture/BACKUP.md` (a
estratégia de backup). Aqui está só o "como", passo a passo.

**Convenção de rigor usada neste documento**: cada afirmação sobre o que
funciona está marcada como **CONFIRMADO** (verificado por inspeção de
ficheiros reais deste repositório ou por pesquisa em fontes oficiais),
**TESTADO LOCALMENTE** (corrido de facto neste ambiente de desenvolvimento),
**DOCUMENTADO** (procedimento escrito e correto, mas sem execução possível
aqui), ou **NÃO TESTADO — DEPENDE DA ORACLE CLOUD** (só pode ser confirmado
na VM real). Ver `docs/KONTA_BETA_GATE.md` e `DECISIONS.md` para o
histórico completo desta distinção.

---

## 1–2. Criar a conta e a VM Oracle Cloud Always Free

**DOCUMENTADO — a Oracle não me deixa criar isto por ti; estes cliques são
para ti fazeres.**

1. Cria uma conta em [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
   (pede cartão de crédito para verificação de identidade — é uma prática
   comum da indústria contra abuso do tier gratuito; ver secção "Billing
   Safety" abaixo para como isto não se traduz em cobranças enquanto ficares
   dentro dos limites Always Free).
2. No Console da Oracle Cloud, **Compute → Instances → Create Instance**.
3. **Image**: escolhe **Canonical Ubuntu 24.04** (imagem oficial suportada
   para Ampere A1 — confirmado por pesquisa nesta tarefa,
   `docs.oracle.com/en-us/iaas/images/ubuntu-2404/`).
4. **Shape**: muda de "Virtual Machine — Standard.E2.1.Micro" (o padrão) para
   **Ampere → VM.Standard.A1.Flex**. Configura:
   - **OCPUs: 2**
   - **Memory: 12 GB**
   (Ver secção "Custo" abaixo — este é atualmente o limite total Always Free
   do Ampere A1 por conta, não um valor arbitrário; não pedir mais do que
   isto evita qualquer risco de cobrança.)
5. **Add SSH keys**: a Oracle não te deixa avançar sem uma chave SSH pública.
   No Windows, gera um par de chaves antes de continuar (secção 3 abaixo) e
   volta aqui para colar a chave pública, ou usa "Generate a key pair for me"
   e descarrega a chave privada que a Oracle gera (menos recomendado —
   preferir gerar a tua própria).
6. **Boot volume**: deixa o valor por omissão (50 GB) — cabe dentro do
   limite de 200 GB Always Free com margem para o Postgres crescer.
7. **Create**. Espera a instância ficar "Running" e anota o **Public IP
   Address** que a Oracle atribui — vais precisar dele em quase todos os
   passos seguintes (SSH, `SITE_ADDRESS`, Security List).

## 3. Configurar SSH a partir do Windows

**DOCUMENTADO.**

Se ainda não tens um par de chaves SSH, no **PowerShell** (Windows 10/11 já
trazem OpenSSH incluído, não precisas de instalar o PuTTY):

```powershell
ssh-keygen -t ed25519 -C "konta-oracle"
# aceita o caminho por omissão (C:\Users\<tu>\.ssh\id_ed25519)
```

Copia o conteúdo de `id_ed25519.pub` para o campo "SSH keys" ao criar a VM
(passo 2.5 acima) se ainda não o fizeste. Depois de a VM estar "Running":

```powershell
ssh -i C:\Users\<tu>\.ssh\id_ed25519 ubuntu@<IP-PUBLICO-DA-VM>
```

(O utilizador por omissão da imagem Ubuntu da Oracle é `ubuntu`, não
`root` — confirmado pela documentação oficial da imagem.)

## 4. Configurar o firewall — a parte que costuma confundir na Oracle

**DOCUMENTADO — este passo tem uma armadilha específica da Oracle, não
genérica de "qualquer VPS".**

Há **duas** camadas de firewall a abrir, não uma só — esquecer a segunda é
o erro mais comum ao expor uma app nova numa VM Oracle:

### 4.1. Security List / Network Security Group (camada de rede da Oracle)

No Console: **Networking → Virtual Cloud Networks → (a tua VCN) → Security
Lists → Default Security List**. Adiciona **Ingress Rules**:

| Source CIDR | Protocolo | Porta destino | Motivo |
|---|---|---|---|
| `0.0.0.0/0` | TCP | 22 | SSH (normalmente já vem aberta por omissão) |
| `0.0.0.0/0` | TCP | 80 | HTTP (necessário para o desafio Let's Encrypt) |
| `0.0.0.0/0` | TCP | 443 | HTTPS |

**Não abrir a porta 5432 (Postgres) aqui** — o Postgres nunca deve ficar
acessível publicamente (ver `docker-compose.prod.yml`, que já nem publica
essa porta para o próprio host).

### 4.2. Firewall interno da própria VM Ubuntu — a armadilha

**Confirmado por pesquisa nesta tarefa, fonte oficial da Oracle**
([blogs.oracle.com/developers, "Enabling Network Traffic to Ubuntu Images in OCI"](https://blogs.oracle.com/developers/enabling-network-traffic-to-ubuntu-images-in-oracle-cloud-infrastructure)):
mesmo depois de abrir 80/443 na Security List, o tráfego **continua** a não
chegar à aplicação. A imagem Ubuntu oficial da Oracle vem com um firewall
interno (`iptables`, já persistido via `iptables-persistent`) que só deixa
passar SSH por omissão — independentemente da Security List. A própria
Oracle recomenda **não** resolver isto com `ufw` (pode entrar em conflito
com as regras `iptables` já existentes na imagem) — editar `iptables`
diretamente:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -m state --state NEW -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -m state --state NEW -j ACCEPT
sudo netfilter-persistent save
```

(`-I INPUT` insere a regra no início da cadeia — importante, porque a
imagem já tem uma regra `REJECT` mais abaixo; uma regra `-A` (append) no
fim nunca seria alcançada. `netfilter-persistent save` torna a regra
permanente entre reinícios.)

Confirma com `sudo iptables -L INPUT -n --line-numbers` que as regras 80/443
aparecem **antes** de qualquer `REJECT`.

## 5–6. Instalar Docker e Docker Compose

**DOCUMENTADO** (procedimento oficial do Docker para Ubuntu, aplicável em
ARM64 sem alterações — o script/repositório oficial do Docker já serve o
pacote certo por arquitetura):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
# sai e volta a entrar por SSH para o grupo "docker" fazer efeito
docker --version && docker compose version
```

`docker-compose-plugin` dá o comando `docker compose` (sem hífen) já usado
em todos os scripts e neste guia — a mesma sintaxe do `docker-compose.yml`
de desenvolvimento.

## 7. Clonar o repositório

**DOCUMENTADO.**

```bash
sudo apt-get install -y git
git clone <URL-do-teu-repositório-GitHub> konta
cd konta
```

Fluxo pedido (secção 15/16 do briefing): desenvolves no Windows, fazes
`git push` para o GitHub, e é esse repositório que clonas/atualizas aqui na
VM — nunca precisas de correr nada de produção no teu portátil.

## 8. Configurar `.env.production`

**DOCUMENTADO** (ver `docs/architecture/DEPLOYMENT.md`, secção 4, e
`.env.production.example` para a lista completa e comentada de variáveis):

```bash
cp .env.production.example .env.production
openssl rand -base64 48   # usar o resultado como AUTH_SECRET
openssl rand -base64 24   # usar o resultado (só a parte alfanumérica) como POSTGRES_PASSWORD
nano .env.production      # colar os valores gerados, e o SITE_ADDRESS (ver secção "HTTPS" abaixo)
```

**Nunca** reutilizar `konta_dev_pw` nem nenhum segredo de desenvolvimento.

## 9. Executar as migrações

**DOCUMENTADO** (mecânica já usada em desenvolvimento, ver `WINDOWS_SETUP.md`
— o Prisma CLI continua bloqueado neste tipo de ambiente sandboxado, os
SQL manuais em `prisma/manual-sql/` continuam a ser a fonte de verdade):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d db
docker compose -f docker-compose.prod.yml ps   # esperar "healthy"
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U konta -d konta -f /migrations/0001_init.sql
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U konta -d konta -f /migrations/0002_seed_categories.sql
```

## 10. Iniciar os containers (app + Caddy)

**NÃO TESTADO — DEPENDE DA ORACLE CLOUD** (é aqui que a compatibilidade
ARM64 fica confirmada por execução real pela primeira vez — ver
`DEPLOYMENT.md`, secção 3, e `DECISIONS.md` para a análise completa de
porque isto é esperado funcionar sem alterações):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build app caddy
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app caddy   # Ctrl+C para sair do acompanhamento
```

## 11. Verificar o health check

**DOCUMENTADO** (o endpoint em si — Prioridade 6 do Pre-Beta Hardening —
está testado; só a execução na VM real é nova):

```bash
docker compose -f docker-compose.prod.yml exec app wget -qO- http://127.0.0.1:3000/api/health
# depois de HTTPS estar a funcionar (secção seguinte):
curl -i https://<SITE_ADDRESS>/api/health
```

Deve devolver `200` e um corpo sem nenhum dado sensível.

## 12–13. Reverse proxy e HTTPS

**Já configurado no `docker-compose.prod.yml`/`Caddyfile` deste repositório
— aqui é só definir `SITE_ADDRESS` e confirmar.**

### Sem domínio próprio (situação inicial, orçamento $0)

Usa o IP público da VM (anotado no passo 2) num hostname `sslip.io` — troca
os pontos por hífenes:

```
IP público: 203.0.113.10
SITE_ADDRESS=203-0-113-10.sslip.io
```

Define isto em `.env.production` (passo 8) **antes** de subir o `caddy`
(passo 10). O Caddy pede automaticamente um certificado real ao Let's
Encrypt para esse hostname na primeira vez que arranca — não precisas de
gerar nada manualmente. Ver `DECISIONS.md`, "HTTPS sem domínio próprio",
para a explicação completa de porque isto é seguro e não um workaround
frágil.

### Com domínio próprio (mais tarde, secção 13 do briefing)

Quando comprares um domínio (ex. `konta.app` ou `konta.cv`):

1. Cria um registo DNS tipo `A` a apontar para o IP público da VM.
2. Muda só `SITE_ADDRESS=konta.app` em `.env.production`.
3. `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build caddy`.

Nada mais muda — nem o `Caddyfile`, nem o resto do compose, nem o código da
aplicação. A app **não sabe** nem precisa de saber que hostname está a ser
usado; isso é inteiramente responsabilidade do Caddy.

## 14. Configurar os backups

Ver `docs/architecture/BACKUP.md` (estratégia completa) — aqui só os
comandos específicos da Oracle:

### 14.1. Criar o bucket de Object Storage

**DOCUMENTADO.** Console: **Storage → Object Storage & Archive Storage →
Buckets → Create Bucket**. Nome sugerido: `konta-backups`. Deixa o "Storage
Tier" em **Standard** (o Always Free cobre Standard/Infrequent
Access/Archive combinados — ver secção "Custo" abaixo).

### 14.2. Gerar credenciais e configurar o `rclone`

**DOCUMENTADO** (rclone tem suporte nativo à Oracle, confirmado por
pesquisa nesta tarefa — `rclone.org/oracleobjectstorage`):

```bash
sudo apt-get install -y rclone
rclone config
# escolher: n (new remote) → nome "oracle" → tipo "oracleobjectstorage"
# seguir o assistente interativo: escolher "user_principal_auth" ou colar
# uma Customer Secret Key gerada em Console → Identity → Users → (o teu
# utilizador) → Customer Secret Keys → Generate Secret Key.
```

As credenciais ficam em `~/.config/rclone/rclone.conf`, **fora do
repositório Git**, nunca copiadas para nenhuma imagem Docker.

### 14.3. Agendar o backup diário — cron (mais simples)

```bash
crontab -e
```

Adicionar:

```cron
0 3 * * * cd /home/ubuntu/konta && \
  COMPOSE_FILE=docker-compose.prod.yml POSTGRES_DB=konta RCLONE_REMOTE=oracle:konta-backups \
  ./scripts/backup/backup.sh >> /var/log/konta-backup.log 2>&1
```

### 14.4. Agendar o backup diário — systemd timer (alternativa mais robusta)

```bash
sudo tee /etc/systemd/system/konta-backup.service > /dev/null <<'EOF'
[Unit]
Description=Konta — backup diário do Postgres

[Service]
Type=oneshot
WorkingDirectory=/home/ubuntu/konta
Environment=COMPOSE_FILE=docker-compose.prod.yml
Environment=POSTGRES_DB=konta
Environment=RCLONE_REMOTE=oracle:konta-backups
ExecStart=/home/ubuntu/konta/scripts/backup/backup.sh
EOF

sudo tee /etc/systemd/system/konta-backup.timer > /dev/null <<'EOF'
[Unit]
Description=Konta — agenda diária do backup

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now konta-backup.timer
systemctl list-timers konta-backup.timer   # confirma o próximo disparo
```

Uma falha fica visível em `systemctl status konta-backup.service` (estado
`failed`) e em `journalctl -u konta-backup.service` — sem precisar de MTA
local nenhum para email de cron.

### 14.5. Lifecycle rule no bucket (evitar esgotar os 20 GB Always Free)

**DOCUMENTADO.** Console: **Storage → Buckets → konta-backups → Lifecycle
Policy Rules → Create Rule**. Sugestão: apagar objetos com mais de 90 dias.

## 15. Verificar o backup

**DOCUMENTADO** (script já testado contra Postgres real neste sandbox — ver
`BACKUP.md` — falta só correr na VM real):

```bash
latest="$(ls -t backups/konta_*.dump | head -1)"
COMPOSE_FILE=docker-compose.prod.yml ./scripts/backup/verify-backup.sh "$latest"
rclone ls oracle:konta-backups   # confirma que o upload externo aconteceu
```

## 16–18. Atualizar, rollback e restaurar

Ver `docs/operations/PRODUCTION-RUNBOOK.md` para o procedimento completo
(estes três passos merecem o detalhe operacional de um runbook próprio, não
uma lista curta aqui).

---

## Custo da infraestrutura Beta

Objetivo: **$0/mês**. Tabela componente a componente — nenhum destes valores
foi "assumido gratuito"; todos vêm da documentação oficial da Oracle
consultada nesta tarefa (`docs.oracle.com`, página "Always Free Resources")
ou da análise dos scripts/documentação já existentes.

| Componente | Gratuito? | Limite Always Free (confirmado) | Risco de cobrança |
|---|---|---|---|
| VM Compute (Ampere A1) | Sim | 2 OCPU + 12 GB RAM (1.500 horas-OCPU/9.000 horas-GB por mês) — reduzido de 4/24 em 15/06/2026 | Só se pedires **mais** do que 2 OCPU/12 GB total entre todas as instâncias A1 da conta |
| Boot/Block Volume | Sim | 200 GB combinados (boot + block), 5 backups de volume incluídos | Só se ultrapassares 200 GB no total |
| Object Storage (backups) | Sim | 20 GB combinados (Standard+IA+Archive) + 50.000 pedidos de API/mês | Só se ultrapassares 20 GB ou 50k pedidos/mês (ver cálculo em `BACKUP.md`, bem abaixo disto para 10–30 utilizadores) |
| Outbound Data Transfer | Sim | 10 TB/mês (conta inteira) | Praticamente impossível de atingir com 10–30 utilizadores numa app de finanças pessoais (sem vídeo/streaming) |
| HTTPS (Caddy + sslip.io/Let's Encrypt) | Sim | Sem limite relevante — sslip.io e Let's Encrypt são serviços gratuitos de terceiros, não da Oracle | Nenhum — mas ver "Limitations" no `KONTA_BETA_GATE.md` sobre dependência de terceiros |
| Domínio próprio | Não aplicável ainda | — | Só quando decidires comprar um (secção 13 do briefing — não bloqueia o lançamento) |
| Monitorização | Sim | Logs Docker + health check + `docker stats` — sem serviço pago | Nenhum (não contratado Sentry/Datadog, por decisão explícita) |
| CI/CD | Sim | Nenhum implementado agora (deploy manual via SSH, secção seguinte) | Nenhum |

## Billing Safety

A conta Oracle tem cartão associado — o requisito é **nunca haver
surpresa**. Regras concretas, não genéricas:

- **Recursos Always Free a usar**: exatamente os listados na tabela acima —
  1 VM Ampere A1 (2 OCPU/12 GB), 1 boot volume (50 GB, dentro dos 200 GB),
  1 bucket Object Storage (dentro de 20 GB).
- **Recursos a NÃO criar**: qualquer shape de VM que não seja
  `VM.Standard.A1.Flex` (dentro do limite 2/12) ou `VM.Standard.E2.1.Micro`;
  qualquer volume de bloco além dos 200 GB combinados; qualquer Load
  Balancer além do único Always Free (nem sequer é necessário para esta
  arquitetura — o Caddy já faz de reverse proxy); qualquer serviço gerido
  (Autonomous Database, OKE, etc.) — nada disto está no âmbito desta Beta.
- **Configurações que podem gerar cobrança**: aumentar o shape da VM para
  além de 2 OCPU/12 GB; criar uma segunda VM A1 que ultrapasse o total
  Always Free; ativar qualquer serviço fora da lista "Always Free
  Eligible" no próprio Console (a Oracle marca isto visualmente ao criar
  cada recurso — confirmar sempre esse selo antes de clicar "Create").
- **Como verificar uso**: Console → **Billing → Cost Analysis** e
  **Governance → Limits, Quotas and Usage** — revisão recomendada
  semanalmente durante a Beta.
- **Como configurar limites/quotas**: Console → **Governance → Budgets →
  Create Budget**, definir um budget de $0–1 com alerta por email a 0.01
  USD de gasto previsto — a forma mais direta de detetar qualquer desvio
  do "Always Free" antes de se tornar uma fatura real.
- **Como evitar upgrade acidental**: a conta Oracle Cloud Free Tier tem uma
  distinção entre "Always Free" e o crédito promocional de 30 dias
  ($300, consumível por recursos pagos) — **não aceitar nenhum prompt do
  Console que ofereça "upgrade to Pay As You Go"** enquanto o objetivo for
  $0; isto não acontece sozinho, é sempre uma ação explícita do utilizador
  no Console.

## Capacidade

Estimativa razoável, não um benchmark artificial — baseada na arquitetura
atual (Next.js + Postgres, sem processamento pesado, sem imagens/vídeo).

**10 utilizadores**: folgado. 2 OCPU/12 GB ARM64 é generosamente mais do
que uma app Next.js + Postgres pequena precisa para 10 pessoas a usar
esporadicamente ao longo do dia.

**30 utilizadores**: ainda confortável. O índice `(userId, date)` já
identificado como suficiente no `GO_TO_BETA_AUDIT.md` continua a cobrir a
query principal; a RAM (12 GB) tem margem larga para o `shared_buffers` do
Postgres e o processo Node em simultâneo.

**100 utilizadores**: **provável ponto de atenção, não um "não funciona"**
— `listAllTransactionsForBalances` recalcula tudo do zero em cada
carregamento do dashboard/contas (já identificado como item 6.6 do audit
original, aceite como limitação para 10–30). Com 100 utilizadores ativos
seria a primeira coisa a revisitar (paginação/cache), antes de qualquer
alteração à VM — a VM em si (2 OCPU/12 GB) provavelmente ainda aguenta 100
utilizadores moderados; o risco está no padrão de query, não na
infraestrutura. Documentado como escala futura, fora do âmbito desta Beta.

**Bandwidth/backup**: 10 TB/mês de saída e 20 GB de Object Storage cobrem
folgadamente os três cenários acima — ver cálculo detalhado em
`BACKUP.md`.

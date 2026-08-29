// Script de conveniência para recriar, no teu ambiente local, os mesmos dados
// de demonstração usados nas screenshots que te foram mostradas. Usa apenas a
// API pública (fetch), tal como qualquer cliente externo faria — não toca na
// base de dados diretamente. Corre-o DEPOIS de teres o servidor a correr
// (npm run dev), noutro terminal:
//
//   node scripts/seed-demo.mjs
//
// Se o utilizador demo já existir, o registo falha com 409 e o script tenta
// autenticar-se com as mesmas credenciais e continua a partir daí (é seguro
// correr o script mais do que uma vez, mas vai duplicar transações se já
// existirem — se quiseres recomeçar do zero, apaga o utilizador na BD).

const BASE_URL = process.env.KONTA_BASE_URL ?? "http://localhost:3000";
const EMAIL = "demo@konta.cv";
const PASSWORD = "demoSenha123";

let cookieJar = "";

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookieJar ? { Cookie: cookieJar } : {}),
      ...(options.headers ?? {}),
    },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookieJar = setCookie.split(";")[0];
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function main() {
  console.log(`A ligar a ${BASE_URL}...`);

  let { res } = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Nico", email: EMAIL, password: PASSWORD }),
  });

  if (res.status === 409 || res.status === 400) {
    console.log("Utilizador demo já existe, a autenticar...");
    ({ res } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }));
    if (!res.ok) throw new Error(`Login falhou: ${res.status}`);
  } else if (!res.ok) {
    throw new Error(`Registo falhou: ${res.status}`);
  }
  console.log("Autenticado como", EMAIL);

  async function createAccount(name, type, initialBalanceMinor = 0) {
    const { res, body } = await api("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name, type, initialBalanceMinor }),
    });
    if (!res.ok) throw new Error(`Falha ao criar conta ${name}: ${JSON.stringify(body)}`);
    console.log("Conta criada:", name, "->", body.id);
    return body.id;
  }

  const bankId = await createAccount("Banco BCA", "BANK");
  const walletId = await createAccount("Carteira", "WALLET");
  const savingsId = await createAccount("Poupança Férias", "SAVINGS");
  const emergencyId = await createAccount("Cofre de Emergência", "EMERGENCY_FUND");

  async function createTx(input) {
    const { res, body } = await api("/api/transactions", { method: "POST", body: JSON.stringify(input) });
    if (!res.ok) throw new Error(`Falha ao criar transação ${input.description}: ${JSON.stringify(body)}`);
    console.log("Transação criada:", input.description);
    return body;
  }

  await createTx({ type: "INCOME", accountId: bankId, amountMinor: 180000, description: "Salário Agosto", date: "2026-08-01" });
  await createTx({ type: "EXPENSE", accountId: bankId, amountMinor: 35000, description: "Renda de casa", date: "2026-08-02" });
  await createTx({ type: "TRANSFER", accountId: bankId, destinationAccountId: emergencyId, amountMinor: 50000, description: "Depósito cofre", date: "2026-08-03" });
  await createTx({ type: "TRANSFER", accountId: bankId, destinationAccountId: savingsId, amountMinor: 30000, description: "Poupança do mês", date: "2026-08-05" });
  await createTx({ type: "EXPENSE", accountId: walletId, amountMinor: 12500, description: "Supermercado Calu", date: "2026-08-10" });
  await createTx({ type: "EXPENSE", accountId: walletId, amountMinor: 4000, description: "Hiace para o trabalho", date: "2026-08-12" });
  await createTx({ type: "EXPENSE", accountId: bankId, amountMinor: 8000, description: "Jantar de aniversário", date: "2026-08-15" });
  await createTx({ type: "TRANSFER", accountId: emergencyId, destinationAccountId: bankId, amountMinor: 20000, description: "Levantamento emergência", date: "2026-08-20" });
  await createTx({ type: "EXPENSE", accountId: walletId, amountMinor: 6000, description: "Mercado municipal", date: "2026-08-22" });

  console.log("\nDados de demonstração criados. Entra em", `${BASE_URL}/login`, "com", EMAIL, "/", PASSWORD);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

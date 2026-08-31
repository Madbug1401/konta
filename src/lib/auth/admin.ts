// [Sugestão do utilizador — painel de estatísticas visível só para o dono
// do projeto] Não existe nenhum campo "role"/"isAdmin" no schema — para um
// projeto com um único dono e uma Beta pequena e conhecida, isso seria
// complexidade a mais (mais uma migração, mais um sítio para gerir
// permissões). Em vez disso, a lista de emails admin vive só numa variável
// de ambiente, nunca no código nem na base de dados, e falha sempre
// fechada: sem ADMIN_EMAILS configurado no ambiente, ninguém — nem o
// próprio dono — vê o painel. Comparação sempre em minúsculas, coerente
// com normalizeEmail em src/lib/db/users.ts.
function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}

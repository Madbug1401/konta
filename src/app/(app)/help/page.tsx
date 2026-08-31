import { Card } from "@/components/ui/card";

// [Sugestão do utilizador — antes de abrir a app aos primeiros utilizadores
// da Beta] Página de referência estática, sem nenhuma consulta à base de
// dados — propositadamente, para ser uma explicação simples de cada secção,
// não um tutorial interativo (fica reservado para mais tarde, se a Beta
// crescer para além de um grupo pequeno e conhecido). Todo o texto reflete
// comportamento real já implementado e testado — nunca uma promessa de algo
// que a app ainda não faz.
export default function HelpPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Como funciona o Konta</h1>
        <p className="text-sm text-muted-foreground">Um resumo rápido de cada secção — para tirares o máximo partido da app desde o primeiro dia.</p>
      </div>

      <Section title="Contas">
        Uma conta representa qualquer sítio onde tens dinheiro: carteira, conta bancária, poupança, cartão de
        crédito, fundo de emergência ou investimento. Cria quantas precisares em <b>Contas</b>. O saldo de cada
        conta é sempre calculado a partir do saldo inicial mais tudo o que registares — nunca precisas de o
        corrigir manualmente.
        <br />
        <br />
        Já não usas uma conta? Podes arquivá-la em vez de a apagar — uma conta arquivada deixa de aparecer no
        Dashboard e para de aceitar novas transações, mas o teu histórico e o saldo continuam a contar para o teu
        património total. Só é possível apagar definitivamente uma conta se ela nunca tiver tido nenhuma
        transação, meta, recorrência ou investimento associado — assim nunca perdes histórico por engano.
      </Section>

      <Section title="Transações">
        Cada movimento de dinheiro é uma transação: uma receita, uma despesa ou uma transferência entre duas das
        tuas contas. Podes organizá-las por categoria — e criar uma categoria nova diretamente no formulário, sem
        sair dele —, filtrar por conta, categoria, tipo ou período, e editar ou apagar qualquer transação depois de
        criada.
      </Section>

      <Section title="Dívidas">
        Regista uma dívida com o valor total, o número de parcelas e a data de início — o Konta calcula
        automaticamente o plano de pagamento. Cada parcela paga gera uma despesa na conta que escolheres. Se uma
        dívida deixar de ser paga, podes marcá-la como incumprida (esta ação não pode ser revertida).
      </Section>

      <Section title="Metas">
        Define um valor-alvo e, se quiseres, uma data — e opcionalmente liga a meta a uma conta específica (por
        exemplo, uma poupança) para acompanhares o progresso em tempo real. Quando atingires o objetivo, marca a
        meta como alcançada.
      </Section>

      <Section title="Recorrências">
        Para receitas ou despesas que se repetem (salário, renda, subscrições), cria uma transação recorrente uma
        única vez. O Konta gera as ocorrências automaticamente à medida que as datas chegam — não precisas de as
        registar manualmente todos os meses. Podes pausar ou retomar uma série a qualquer momento.
      </Section>

      <Section title="Investimentos">
        Numa conta do tipo Investimento, podes registar o capital que investiste e o valor atual em separado —
        assim a rentabilidade real nunca se confunde com o simples crescimento do saldo. Regista uma nova avaliação
        sempre que quiseres atualizar o valor.
      </Section>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-foreground">Perguntas frequentes</h2>
        <div className="flex flex-col gap-3.5">
          <Faq question="Os meus dados são só meus?">
            Sim. Cada conta do Konta é totalmente isolada — ninguém, incluindo outros utilizadores, vê os teus
            dados.
          </Faq>
          <Faq question="Posso apagar uma conta, dívida ou meta?">
            Dívidas e metas nunca se apagam — só podes marcá-las como incumprida, alcançada ou abandonada quando
            deixarem de estar ativas, para nunca perderes o histórico. Contas podem ser apagadas definitivamente,
            mas só se nunca tiverem tido nenhum movimento associado; caso contrário, arquiva-as.
          </Faq>
          <Faq question="O património total no Dashboard inclui contas arquivadas?">
            Sim — arquivar uma conta esconde-a do dia a dia, mas o dinheiro nela continua a ser teu e a contar para
            o total.
          </Faq>
          <Faq question="Esqueci-me de abrir a app durante uns dias — as minhas recorrências atrasaram-se?">
            Não há nada a recuperar: assim que abrires a app, o Konta gera automaticamente todas as ocorrências em
            atraso.
          </Faq>
        </div>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-2 text-base font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{children}</p>
    </Card>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{question}</p>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

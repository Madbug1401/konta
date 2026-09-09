import {
  Info,
  ListChecks,
  ShieldCheck,
  HelpCircle,
  Wallet,
  List,
  Landmark,
  Target,
  Repeat,
  TrendingUp,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { FeedbackForm } from "@/components/feedback-form";

// [Sugestão do utilizador — antes de abrir a app aos primeiros utilizadores
// da Beta] Página de referência estática, sem nenhuma consulta à base de
// dados — propositadamente, para ser uma explicação simples e organizada de
// cada secção e do próprio projeto, não um tutorial interativo (fica
// reservado para mais tarde, se a Beta crescer para além de um grupo
// pequeno e conhecido). Todo o texto reflete comportamento real já
// implementado e testado — nunca uma promessa de algo que a app ainda não
// faz.
const QUICK_LINKS = [
  { href: "#sobre", label: "O que é o Konta" },
  { href: "#comecar", label: "Como começar" },
  { href: "#contas", label: "Contas" },
  { href: "#transacoes", label: "Transações" },
  { href: "#dividas", label: "Dívidas" },
  { href: "#metas", label: "Metas" },
  { href: "#recorrencias", label: "Recorrências" },
  { href: "#investimentos", label: "Investimentos" },
  { href: "#seguranca", label: "Segurança e privacidade" },
  { href: "#faq", label: "Perguntas frequentes" },
  { href: "#feedback", label: "Feedback" },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Ajuda</h1>
        <p className="text-sm text-muted-foreground">
          Tudo o que precisas de saber sobre o Konta: o que é, como começar, e como funciona cada secção.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex items-center rounded-md bg-surface-hover px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-primary/15 hover:text-primary"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      <Card id="sobre" className="scroll-mt-4 border-primary/30">
        <SectionTitle icon={Info}>O que é o Konta</SectionTitle>
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            O Konta é um gestor financeiro pessoal — um único sítio para veres, de forma real e completa, para onde
            vai o teu dinheiro: contas, transações do dia a dia, dívidas, metas de poupança, receitas/despesas
            recorrentes e investimentos.
          </p>
          <p>
            Foi construído a pensar em quem quer trocar folhas de cálculo ou apps genéricas por algo pensado à
            medida das suas contas, sem depender de bancos ou serviços externos — tu introduzes os movimentos, o
            Konta faz as contas.
          </p>
          <p>Alguns princípios que orientam a app desde o início:</p>
          <ul className="flex flex-col gap-1.5 pl-1">
            <Principle>
              <b className="font-medium text-foreground">Nunca inventa números.</b> Tudo o que vês (saldos,
              gráficos, progresso de metas) vem sempre de dados reais que registaste — nunca de um valor estimado a
              “parecer completo”.
            </Principle>
            <Principle>
              <b className="font-medium text-foreground">Nunca apaga histórico em silêncio.</b> Contas, dívidas e
              metas arquivam-se ou encerram-se em vez de desaparecerem — o teu histórico financeiro mantém-se
              sempre íntegro.
            </Principle>
            <Principle>
              <b className="font-medium text-foreground">Os teus dados são só teus.</b> Isolados por utilizador,
              nunca partilhados nem usados para mais nada.
            </Principle>
          </ul>
          <p className="text-xs">
            Estás a usar uma versão Beta inicial — se encontrares algo estranho ou tiveres uma sugestão,{" "}
            <a href="#feedback" className="font-medium text-primary hover:underline">
              manda feedback diretamente aqui
            </a>
            .
          </p>
        </div>
      </Card>

      <Card id="comecar" className="scroll-mt-4">
        <SectionTitle icon={ListChecks}>Como começar</SectionTitle>
        <ol className="flex flex-col gap-3 text-sm">
          <li className="flex gap-3">
            <StepNumber>1</StepNumber>
            <span className="text-muted-foreground">
              <Link href="/accounts" className="font-medium text-primary hover:underline">
                Cria a tua primeira conta
              </Link>{" "}
              — carteira, banco, poupança, cartão de crédito, fundo de emergência ou investimento.
            </span>
          </li>
          <li className="flex gap-3">
            <StepNumber>2</StepNumber>
            <span className="text-muted-foreground">
              <Link href="/transactions/new" className="font-medium text-primary hover:underline">
                Regista a tua primeira transação
              </Link>{" "}
              — uma receita, uma despesa, ou uma transferência entre contas.
            </span>
          </li>
          <li className="flex gap-3">
            <StepNumber>3</StepNumber>
            <span className="text-muted-foreground">
              Explora as outras secções quando precisares — Dívidas, Metas, Recorrências e Investimentos são todas
              opcionais, e continuam à tua espera para quando fizerem sentido.
            </span>
          </li>
        </ol>
      </Card>

      <p className="text-sm font-semibold text-muted-foreground">Guia por secção</p>

      <Section id="contas" title="Contas" icon={Wallet}>
        Uma conta representa qualquer sítio onde tens dinheiro: carteira, conta bancária, poupança, cartão de
        crédito, fundo de emergência ou investimento — cada uma com a sua própria moeda. Cria quantas precisares em{" "}
        <b>Contas</b>. O saldo de cada conta é sempre calculado a partir do saldo inicial mais tudo o que
        registares — nunca precisas de o corrigir manualmente.
        <br />
        <br />
        Já não usas uma conta? Podes arquivá-la em vez de a apagar — uma conta arquivada deixa de aparecer no
        Dashboard e para de aceitar novas transações, mas o teu histórico e o saldo continuam a contar para o teu
        património total. Só é possível apagar definitivamente uma conta se ela nunca tiver tido nenhuma
        transação, meta, recorrência ou investimento associado — assim nunca perdes histórico por engano.
      </Section>

      <Section id="transacoes" title="Transações" icon={List}>
        Cada movimento de dinheiro é uma transação: uma receita, uma despesa ou uma transferência entre duas das
        tuas contas. Podes organizá-las por categoria — e criar uma categoria nova diretamente no formulário, sem
        sair dele —, filtrar por conta, categoria, tipo ou período, e editar ou apagar qualquer transação depois de
        criada.
      </Section>

      <Section id="dividas" title="Dívidas" icon={Landmark}>
        Regista uma dívida com o valor total, o número de parcelas e a data de início — o Konta calcula
        automaticamente o plano de pagamento. Cada parcela paga gera uma despesa na conta que escolheres. Se uma
        dívida deixar de ser paga, podes marcá-la como incumprida (esta ação não pode ser revertida).
      </Section>

      <Section id="metas" title="Metas" icon={Target}>
        Define um valor-alvo e, se quiseres, uma data — e opcionalmente liga a meta a uma conta específica (por
        exemplo, uma poupança) para acompanhares o progresso em tempo real. Quando atingires o objetivo, marca a
        meta como alcançada.
      </Section>

      <Section id="recorrencias" title="Recorrências" icon={Repeat}>
        Para receitas ou despesas que se repetem (salário, renda, subscrições), cria uma transação recorrente uma
        única vez. O Konta gera as ocorrências automaticamente à medida que as datas chegam — não precisas de as
        registar manualmente todos os meses. Podes pausar ou retomar uma série a qualquer momento.
      </Section>

      <Section id="investimentos" title="Investimentos" icon={TrendingUp}>
        Numa conta do tipo Investimento, podes registar o capital que investiste e o valor atual em separado —
        assim a rentabilidade real nunca se confunde com o simples crescimento do saldo. Regista uma nova avaliação
        sempre que quiseres atualizar o valor.
      </Section>

      <Card id="seguranca" className="scroll-mt-4">
        <SectionTitle icon={ShieldCheck}>Segurança e privacidade</SectionTitle>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>A tua palavra-passe nunca é guardada em texto simples — só um hash (bcrypt), impossível de reverter.</li>
          <li>A sessão usa um token assinado (JWT), guardado num cookie que o teu navegador nunca expõe a scripts.</li>
          <li>Os teus dados são isolados por conta de utilizador — ninguém mais os vê, nem outros utilizadores do Konta.</li>
          <li>Em produção, a ligação entre o teu navegador e o Konta é sempre feita por HTTPS.</li>
          <li>
            O acesso ao Konta AI é opcional e desligado por omissão. Quando ativado e usado, as tuas mensagens e um
            resumo dos teus dados financeiros são enviados à Anthropic (o fornecedor do modelo Claude) para gerar a
            resposta; imagens, PDFs e ficheiros que anexares são enviados da mesma forma, só enquanto precisos para
            essa conversa. Se usares o microfone, o áudio é enviado à Groq só para o transcrever em texto — o Konta
            nunca guarda o áudio, antes ou depois de transcrito.
          </li>
        </ul>
      </Card>

      <Card id="faq" className="scroll-mt-4">
        <SectionTitle icon={HelpCircle}>Perguntas frequentes</SectionTitle>
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
          <Faq question="Que moedas o Konta suporta?">
            Ao criar uma conta, escolhes a moeda numa lista (Escudo cabo-verdiano, Euro, Dólar americano, Libra
            esterlina, Real brasileiro) — cada conta fica com a sua própria moeda, independente das outras. Não há
            conversão cambial automática entre contas de moedas diferentes: se tiveres contas em mais do que uma
            moeda, o Dashboard mostra um bloco de totais separado para cada moeda, nunca uma soma a misturá-las.
          </Faq>
          <Faq question="Posso mudar entre tema claro e escuro?">
            Sim, no ícone junto ao logótipo “Konta” na barra lateral (ou no cabeçalho, em telemóvel).
          </Faq>
        </div>
      </Card>

      <Card id="feedback" className="scroll-mt-4">
        <SectionTitle icon={MessageSquare}>Feedback</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          Encontraste um problema, tens uma sugestão ou uma ideia de melhoria? Escreve aqui — a tua mensagem chega
          diretamente a quem gere o Konta, com o teu email e a data associados.
        </p>
        <FeedbackForm />
      </Card>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      {children}
    </h2>
  );
}

function Section({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-4">
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <p className="text-sm text-muted-foreground">{children}</p>
    </Card>
  );
}

function Principle({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function StepNumber({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
      {children}
    </span>
  );
}

function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{question}</p>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

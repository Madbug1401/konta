// @vitest-environment jsdom
//
// Cobre o composer (Parte 7/8/10 do pedido de UX): a transcrição de voz
// preenche o campo sem o enviar sozinha, Enter continua a enviar, Shift+Enter
// continua a permitir nova linha, e texto longo fica todo acessível no valor
// do campo (nunca cortado). `useAssistant`/`useAudioRecorder`/`useToast` são
// mockados — este ficheiro testa o ChatPanel isoladamente, não a conversa
// real (isso já está coberto por orchestrator.test.ts).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom não implementa Element.scrollTo (gap conhecido, não relacionado com
// este componente) — o ChatPanel chama-o para rolar a conversa para o fundo.
Element.prototype.scrollTo = vi.fn();

const sendChatMock = vi.fn();
const confirmPendingMock = vi.fn();
const cancelPendingMock = vi.fn();
const addAttachmentsMock = vi.fn();
const removeAttachmentMock = vi.fn();

let onTranscribedCallback: ((text: string) => void) | null = null;
const recorderState = {
  status: "idle" as "idle" | "recording" | "processing" | "error",
  elapsedSeconds: 0,
  error: null as string | null,
  supported: true,
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
};

// Mutável para os testes do cartão de confirmação (secção "segurança")
// poderem simular um `pending.summary` com o payload de ataque desejado —
// os outros testes deste ficheiro deixam-no `null` (sem cartão visível).
let pendingState: { confirmationToken: string; summary: string; riskTier: string } | null = null;

vi.mock("@/components/assistant-provider", () => ({
  useAssistant: () => ({
    turns: [],
    get pending() {
      return pendingState;
    },
    sending: false,
    error: null,
    pendingAttachments: [],
    addAttachments: addAttachmentsMock,
    removeAttachment: removeAttachmentMock,
    sendChat: sendChatMock,
    confirmPending: confirmPendingMock,
    cancelPending: cancelPendingMock,
  }),
}));

vi.mock("@/components/use-audio-recorder", () => ({
  useAudioRecorder: (onTranscribed: (text: string) => void) => {
    onTranscribedCallback = onTranscribed;
    return recorderState;
  },
}));

vi.mock("@/components/toast-provider", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

async function loadChatPanel() {
  const { ChatPanel } = await import("./chat-panel");
  return ChatPanel;
}

describe("ChatPanel — composer", () => {
  beforeEach(() => {
    onTranscribedCallback = null;
    recorderState.status = "idle";
    pendingState = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("transcrição de voz preenche o campo, mas NUNCA envia automaticamente", async () => {
    const ChatPanel = await loadChatPanel();
    render(<ChatPanel />);

    expect(onTranscribedCallback).not.toBeNull();
    act(() => onTranscribedCallback!("Regista uma despesa de quinhentos escudos no supermercado."));

    const textarea = screen.getByLabelText("Mensagem para o Konta AI") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Regista uma despesa de quinhentos escudos no supermercado.");
    expect(sendChatMock).not.toHaveBeenCalled();
  });

  it('mostra "Transcrição pronta — revê antes de enviar." depois de transcrever', async () => {
    const ChatPanel = await loadChatPanel();
    render(<ChatPanel />);

    act(() => onTranscribedCallback!("Quanto gastei este mês?"));

    expect(screen.getByText("Transcrição pronta — revê antes de enviar.")).toBeTruthy();
  });

  it("Enter (sem Shift) envia a mensagem", async () => {
    const ChatPanel = await loadChatPanel();
    render(<ChatPanel />);

    const textarea = screen.getByLabelText("Mensagem para o Konta AI") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Quanto tenho disponível?" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(sendChatMock).toHaveBeenCalledWith("Quanto tenho disponível?");
  });

  it("Shift+Enter NÃO envia — insere nova linha (comportamento normal do textarea)", async () => {
    const ChatPanel = await loadChatPanel();
    render(<ChatPanel />);

    const textarea = screen.getByLabelText("Mensagem para o Konta AI") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Linha 1" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(sendChatMock).not.toHaveBeenCalled();
  });

  it("uma transcrição longa fica inteira no valor do campo (nunca cortada)", async () => {
    const ChatPanel = await loadChatPanel();
    render(<ChatPanel />);

    const longTranscription = "Regista uma despesa de quinhentos escudos no supermercado. ".repeat(20).trim();
    act(() => onTranscribedCallback!(longTranscription));

    const textarea = screen.getByLabelText("Mensagem para o Konta AI") as HTMLTextAreaElement;
    expect(textarea.value).toBe(longTranscription);
    expect(textarea.value.length).toBeGreaterThan(200);
  });

  it("o utilizador continua a poder editar o texto transcrito antes de enviar", async () => {
    const ChatPanel = await loadChatPanel();
    render(<ChatPanel />);

    act(() => onTranscribedCallback!("Texto transcrito"));
    const textarea = screen.getByLabelText("Mensagem para o Konta AI") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Texto transcrito e corrigido" } });

    expect(textarea.value).toBe("Texto transcrito e corrigido");
  });
});

// [Achado de auditoria — corrigido] `pending.summary` pode conter
// `description`/`category` de texto livre (attachment/voz). Antes desta
// correção, o cartão renderizava esse texto via AiMarkdown — uma
// `description` com quebras de linha literais conseguia escapar da posição
// "entre aspas" do template de summarize() e injetar um heading/lista REAL
// (`<h2>`/`<ul>`/`<li>`) no cartão de confirmação HIGH. O cartão é uma
// superfície de segurança (mostra o que vai ser executado) — nunca deve
// interpretar texto livre como estrutura. Estes testes fixam esse
// comportamento: description sempre texto literal, nunca Markdown.
describe("ChatPanel — cartão de confirmação (segurança: texto literal, nunca Markdown)", () => {
  beforeEach(() => {
    onTranscribedCallback = null;
    recorderState.status = "idle";
    pendingState = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.resetModules();
  });

  function renderWithPendingSummary(summary: string) {
    pendingState = { confirmationToken: "tok_test", summary, riskTier: "HIGH" };
  }

  it("payload real do achado de auditoria: description com \\n\\n## Heading + lista NUNCA vira <h2>/<ul>/<li>", async () => {
    renderWithPendingSummary('Registar uma despesa de 500 (moeda da conta) — "x\n\n## Heading Injetado\n\n- item malicioso", hoje.');
    const ChatPanel = await loadChatPanel();
    const { container } = render(<ChatPanel />);

    expect(container.querySelector("h2")).toBeNull();
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("li")).toBeNull();
    // O texto continua todo lá, só que como texto simples — nada é apagado.
    expect(container.textContent).toContain("Heading Injetado");
    expect(container.textContent).toContain("item malicioso");
  });

  it("description '**50000 CVE**' aparece com os asteriscos literais, nunca em negrito", async () => {
    renderWithPendingSummary('Atualizar a transação: descrição para "**50000 CVE**".');
    const ChatPanel = await loadChatPanel();
    const { container } = render(<ChatPanel />);

    expect(container.querySelector("strong")).toBeNull();
    expect(screen.getByText((_, node) => node?.textContent === 'Atualizar a transação: descrição para "**50000 CVE**".')).toBeTruthy();
  });

  it("description '[Confirmar](https://attacker.example)' nunca vira um link clicável", async () => {
    renderWithPendingSummary('Registar uma despesa de 500 (moeda da conta) — "[Confirmar](https://attacker.example)", hoje.');
    const ChatPanel = await loadChatPanel();
    const { container } = render(<ChatPanel />);

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("[Confirmar](https://attacker.example)");
  });

  it("description '<img src=\"https://attacker.example/x\">' nunca vira uma imagem real", async () => {
    const maliciousDescription = '<img src="https://attacker.example/x">';
    renderWithPendingSummary(`Registar uma despesa de 500 (moeda da conta) — "${maliciousDescription}", hoje.`);
    const ChatPanel = await loadChatPanel();
    const { container } = render(<ChatPanel />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain(maliciousDescription);
  });

  it("description 'texto\\n\\n# heading' nunca cria um <h1> nem qualquer título", async () => {
    renderWithPendingSummary('Registar uma despesa de 500 (moeda da conta) — "texto\n\n# heading", hoje.');
    const ChatPanel = await loadChatPanel();
    const { container } = render(<ChatPanel />);

    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("h2")).toBeNull();
    expect(container.querySelector("h3")).toBeNull();
  });

  it("description 'texto\\n\\n- item' nunca cria uma lista real", async () => {
    renderWithPendingSummary('Registar uma despesa de 500 (moeda da conta) — "texto\n\n- item", hoje.');
    const ChatPanel = await loadChatPanel();
    const { container } = render(<ChatPanel />);

    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("li")).toBeNull();
  });

  it("uma confirmação normal (sem ataque) continua legível, e os botões Confirmar/Cancelar continuam presentes e funcionais", async () => {
    renderWithPendingSummary('Registar uma despesa de 500 (moeda da conta) na categoria "Alimentação" — "Supermercado", hoje.');
    const ChatPanel = await loadChatPanel();
    render(<ChatPanel />);

    expect(screen.getByText('Registar uma despesa de 500 (moeda da conta) na categoria "Alimentação" — "Supermercado", hoje.')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(confirmPendingMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(cancelPendingMock).toHaveBeenCalledTimes(1);
  });

  it("uma confirmação agrupada (lista numerada do Milestone 5b) continua a mostrar as quebras de linha como texto, nunca como <li> reais", async () => {
    renderWithPendingSummary('Encontrei 2 ações a confirmar:\n1. Registar uma despesa de 500 — "Supermercado".\n2. Registar uma despesa de 300 — "Táxi".');
    const ChatPanel = await loadChatPanel();
    const { container } = render(<ChatPanel />);

    expect(container.querySelector("li")).toBeNull();
    expect(container.textContent).toContain("1. Registar uma despesa de 500");
    expect(container.textContent).toContain("2. Registar uma despesa de 300");
  });
});

// @vitest-environment jsdom
//
// Testa o AssistantProvider isoladamente (mocka `fetch`, nunca a rede real)
// — foco no que o Milestone Analytics acrescentou: `pendingUiAction`
// (revalidado no cliente antes de ser exposto) e `visualization` anexada a
// um turno do assistente. O resto do provider (attachments, confirmação)
// já está coberto indiretamente por chat-panel.test.tsx e pelos testes do
// orquestrador/rota — este ficheiro não repete isso.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantProvider, useAssistant } from "./assistant-provider";

vi.mock("@/components/toast-provider", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));

function TestConsumer() {
  const { turns, pendingUiAction, consumePendingUiAction, sendChat } = useAssistant();
  return (
    <div>
      <button type="button" onClick={() => void sendChat("olá")}>
        enviar
      </button>
      <button type="button" onClick={consumePendingUiAction}>
        consumir
      </button>
      <pre data-testid="uiAction">{JSON.stringify(pendingUiAction)}</pre>
      <pre data-testid="lastTurn">{JSON.stringify(turns[turns.length - 1] ?? null)}</pre>
    </div>
  );
}

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => body }),
  );
}

describe("AssistantProvider — Milestone Analytics (uiAction / visualization)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("um uiAction válido na resposta fica disponível em pendingUiAction", async () => {
    mockFetchOnce({ status: "final", reply: "Feito.", uiAction: { period: { preset: "last_30d" } } });
    render(
      <AssistantProvider>
        <TestConsumer />
      </AssistantProvider>,
    );

    await act(async () => {
      screen.getByText("enviar").click();
      await Promise.resolve();
    });

    expect(screen.getByTestId("uiAction").textContent).toContain("last_30d");
  });

  it("consumePendingUiAction limpa o estado — nunca reaplicado depois de consumido", async () => {
    mockFetchOnce({ status: "final", reply: "Feito.", uiAction: { view: "categories" } });
    render(
      <AssistantProvider>
        <TestConsumer />
      </AssistantProvider>,
    );

    await act(async () => {
      screen.getByText("enviar").click();
      await Promise.resolve();
    });
    expect(screen.getByTestId("uiAction").textContent).toContain("categories");

    act(() => screen.getByText("consumir").click());
    expect(screen.getByTestId("uiAction").textContent).toBe("null");
  });

  it("um uiAction INVÁLIDO (campo desconhecido) nunca fica pendente — revalidado no cliente mesmo vindo do servidor", async () => {
    mockFetchOnce({ status: "final", reply: "Feito.", uiAction: { hackField: true } });
    render(
      <AssistantProvider>
        <TestConsumer />
      </AssistantProvider>,
    );

    await act(async () => {
      screen.getByText("enviar").click();
      await Promise.resolve();
    });

    expect(screen.getByTestId("uiAction").textContent).toBe("null");
  });

  it("uma visualização válida fica anexada ao último turno do assistente", async () => {
    const visualization = { type: "metric", title: "Despesas", value: "5000 CVE" };
    mockFetchOnce({ status: "final", reply: "Aqui está.", visualization });
    render(
      <AssistantProvider>
        <TestConsumer />
      </AssistantProvider>,
    );

    await act(async () => {
      screen.getByText("enviar").click();
      await Promise.resolve();
    });

    const lastTurn = JSON.parse(screen.getByTestId("lastTurn").textContent ?? "null");
    expect(lastTurn.visualization).toEqual(visualization);
  });

  it("uma visualização com 'type' inválido (ex: html/iframe) nunca chega ao turno — nunca HTML/JS da IA", async () => {
    mockFetchOnce({ status: "final", reply: "x", visualization: { type: "html", body: "<script>alert(1)</script>" } });
    render(
      <AssistantProvider>
        <TestConsumer />
      </AssistantProvider>,
    );

    await act(async () => {
      screen.getByText("enviar").click();
      await Promise.resolve();
    });

    const lastTurn = JSON.parse(screen.getByTestId("lastTurn").textContent ?? "null");
    expect(lastTurn.visualization).toBeUndefined();
  });
});

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";

// [NOTA DE AMBIENTE] O template original usava next/font/google (Geist), que
// descarrega os ficheiros de fonte de fonts.googleapis.com em build-time.
// Esse domínio está bloqueado pela política de rede deste sandbox (mesmo
// 403 genérico visto em binaries.prisma.sh). Usa-se por isso uma pilha de
// fontes do sistema, que não depende de nenhuma rede — mais rápida a carregar
// e sem "flash" de fonte a trocar. Se quiseres uma tipografia de marca
// própria mais tarde, o mais simples é auto-hospedar os ficheiros .woff2 em
// public/fonts e referenciá-los com @font-face em globals.css, em vez de
// next/font/google.
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';

export const metadata: Metadata = {
  title: "Konta — Gestor Financeiro Pessoal",
  description: "Regista, entende, prevê e orienta o teu dinheiro.",
};

// [Correção — feedback beta, ecrã "precisa de zoom out" no iPhone] O
// Next.js já injeta `width=device-width, initial-scale=1` por omissão
// mesmo sem este export (confirmado a olhar o HTML gerado) — isso não era
// a causa do bug reportado (essa é a falta de `min-w-0` em
// src/components/app-shell.tsx). Este export explícito só acrescenta
// `viewportFit: "cover"`, necessário para os valores de
// `env(safe-area-inset-*)` usados na barra de navegação inferior
// (app-shell.tsx) deixarem de ser sempre 0 e passarem a refletir a área do
// indicador de "home" dos iPhones mais recentes.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt" data-theme="dark" className="h-full antialiased" style={{ fontFamily: FONT_STACK }}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt" data-theme="dark" className="h-full antialiased" style={{ fontFamily: FONT_STACK }}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

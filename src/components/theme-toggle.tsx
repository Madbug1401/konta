"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "konta-theme";

// [Regra 13 do briefing] O tema escuro é a identidade principal do Konta, mas
// a arquitetura suporta tema claro desde já: este componente troca
// data-theme no <html> e persiste a escolha. Todas as cores da aplicação
// vêm de variáveis CSS (ver globals.css) — nenhum componente tem cor
// "hardcoded", por isso a troca de tema não exige tocar em mais nada.
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // localStorage só existe no cliente — não pode ser lido num lazy
    // initializer do useState sem causar mismatch de hidratação face ao HTML
    // gerado no servidor (que assume sempre "dark"). Este efeito corre uma
    // única vez, imediatamente após o primeiro render, para sincronizar o
    // React com essa fonte externa — é o padrão recomendado pelo próprio
    // React para este caso, mesmo sendo sinalizado pela regra genérica.
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label="Alternar tema claro/escuro">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

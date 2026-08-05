"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

/*
	Deixa uma pagina "guardar" a navegacao global (o icone wawa da navbar).

	O board de jogo regista um guard enquanto ha uma partida a decorrer; a navbar
	pergunta ao guard antes de navegar. Se ele devolver true, o clique foi
	intercetado (a pagina mostra o popup de confirmacao) e a navegacao nao
	acontece. Sem guard registado, a navbar comporta-se como sempre.

	Assim a navbar nao precisa de saber que o jogo existe, e o jogo nao precisa
	de saber que links ha na navbar.
*/
type NavGuard = (href: string) => boolean;

const NavGuardContext = createContext<{
	guard: NavGuard | null;
	setGuard: (guard: NavGuard | null) => void;
}>({ guard: null, setGuard: () => {} });

export function NavGuardProvider({ children }: { children: ReactNode }) {
	const [guard, rawSetGuard] = useState<NavGuard | null>(null);

	// setState com uma funcao seria interpretado como updater (prev => next),
	// por isso embrulhamos o guard para o guardar como VALOR.
	const setGuard = useCallback((g: NavGuard | null) => rawSetGuard(() => g), []);

	return (
		<NavGuardContext.Provider value={{ guard, setGuard }}>
			{children}
		</NavGuardContext.Provider>
	);
}

export const useNavGuard = () => useContext(NavGuardContext);

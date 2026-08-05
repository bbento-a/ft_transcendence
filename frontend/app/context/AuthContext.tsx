"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type User = {
	id: string;
	username: string;
	email: string;
	avatarUrl: string | null;
	hasPassword: boolean;
	wins: number;
	losses: number;
	draws: number;
};

type UserContextType = {
	user: User | null;
	loading: boolean;
	// true SO quando o /me confirmou que a sessao e invalida (401/403). Falhas
	// transitorias (429 do throttle, 5xx, rede) NAO poem isto a true, para o
	// RequireAuth nao mandar a pessoa para o login por causa de um erro passageiro.
	sessionExpired: boolean;
	refresh: () => Promise<void>;
	logout: () => Promise<void>;
};

export const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [sessionExpired, setSessionExpired] = useState(false);

    // se 200, guarda o user; se 401/403 (sessao invalida) fica null.
	// noutros erros (429 do throttle, 5xx, rede)
	// limpar o user aqui escondia o icone de perfil e esvaziava as paginas
	// protegidas so porque um pedido falhou temporariamente.
	// nunca atira: quem chama isto faz await antes de navegar, e uma excecao
	// deixava o ecra preso no estado de submit
	const refresh = async () => {
		let res: Response;
		try {
			res = await fetch('/api/auth/me');
		} catch {
			return; // rede em baixo, mantemos o que tinhamos
		}

		if (res.ok) {
			setSessionExpired(false);
			try {
				setUser(await res.json());
			} catch {
				setUser(null); // corpo vazio/invalido, tratamos como sem sessao
			}
			return;
		}

		if (res.status === 401 || res.status === 403) {
			// Sessao mesmo invalida (ex.: user apagado). So AQUI marcamos expirada.
			setUser(null);
			setSessionExpired(true);
		}
		// 429/5xx: nao mexemos no user nem marcamos expirada — e passageiro.
	};

	// mesmo que o pedido falhe limpamos o user, senao ficava logado na UI
	const logout = async () => {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
		} catch {
			// o cookie pode nao ter sido limpo, mas localmente saimos na mesma
		}
		setUser(null);
		setSessionExpired(false); // saida deliberada, nao e sessao-fantasma
	};

	useEffect(() => {
		refresh().finally(() => setLoading(false));
	}, []);

	return (
		<UserContext.Provider value={{ user, loading, sessionExpired, refresh, logout }}>
			{children}
		</UserContext.Provider>
	);
}

export function useUser() {
	const ctx = useContext(UserContext);
	if (!ctx) {
		throw new Error('useUser must be used within a UserProvider');
	}
	return ctx;
}

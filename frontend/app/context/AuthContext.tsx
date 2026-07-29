"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type User = { id: string; username: string; email: string; hasPassword: boolean };

type UserContextType = {
	user: User | null;
	loading: boolean;
	refresh: () => Promise<void>;
	logout: () => Promise<void>;
};

export const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

    // se 200, guarda o user; se 401 (sem cookie valido) fica null
	// nunca atira: quem chama isto faz await antes de navegar, e uma excecao
	// deixava o ecra preso no estado de submit
	const refresh = async () => {
		try {
			const res = await fetch('/api/auth/me');
			setUser(res.ok ? await res.json() : null);
		} catch {
			setUser(null);
		}
	};

	// mesmo que o pedido falhe limpamos o user, senao ficava logado na UI
	const logout = async () => {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
		} catch {
			// o cookie pode nao ter sido limpo, mas localmente saimos na mesma
		}
		setUser(null);
	};

	useEffect(() => {
		refresh().finally(() => setLoading(false));
	}, []);

	return (
		<UserContext.Provider value={{ user, loading, refresh, logout }}>
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

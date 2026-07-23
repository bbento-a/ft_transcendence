"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type User = { id: string; username: string };

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

    // se 200, guarda o user; se 401 (sem cookie valido) 
	const refresh = async () => {
		const res = await fetch('/api/auth/me');
		setUser(res.ok ? await res.json() : null);
	};

	const logout = async () => {
		await fetch('/api/auth/logout', { method: 'POST' });
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

"use client";

import { ReactNode } from "react";
import { useUser } from "@/context/AuthContext";

// o middleware ja bloqueia pedidos sem sessao valida antes de chegarem aqui;
// isto so evita mostrar o conteudo protegido durante o refresh() inicial do UserContext
export default function RequireAuth({ children }: { children: ReactNode }) {
	const { user, loading } = useUser();

	if (loading || !user) {
		return null;
	}

	return <>{children}</>;
}

"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/AuthContext";

// o middleware ja bloqueia pedidos sem sessao valida antes de chegarem aqui;
// isto so evita mostrar o conteudo protegido durante o refresh() inicial do UserContext
export default function RequireAuth({ children }: { children: ReactNode }) {
	const { user, loading } = useUser();
	const router = useRouter();

	// sessao fantasma: o middleware aceita o cookie (assinatura valida) mas o
	// /auth/me diz 401 (ex.: user apagado quando a BD foi recriada). Sem isto a
	// pessoa ficava presa numa pagina vazia, sem icone de perfil nem botao de
	// logout para sair. Limpamos o cookie e so navegamos se a limpeza funcionou,
	// senao o middleware mandava-nos de volta para ca em loop.
	useEffect(() => {
		if (loading || user) return;

		fetch("/api/auth/logout", { method: "POST" })
			.then((res) => {
				if (res.ok) {
					router.replace("/log_in");
					router.refresh();
				}
			})
			.catch(() => {});
	}, [loading, user, router]);

	if (loading || !user) {
		return null;
	}

	return <>{children}</>;
}

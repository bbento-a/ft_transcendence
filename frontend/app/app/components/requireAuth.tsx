"use client";

import { ReactNode, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/AuthContext";

// o middleware ja bloqueia pedidos sem sessao valida antes de chegarem aqui;
// isto so evita mostrar o conteudo protegido durante o refresh() inicial do UserContext
export default function RequireAuth({ children }: { children: ReactNode }) {
	const { user, loading, sessionExpired } = useUser();
	const router = useRouter();
	// Trava para o logout de "sessao fantasma" correr UMA vez. Sem ela disparava
	// varias vezes: o StrictMode (dev) duplica o efeito, e o router.refresh()
	// abaixo provoca re-renders enquanto o user continua null, re-disparando.
	const loggingOut = useRef(false);

	// sessao fantasma: o middleware aceita o cookie (assinatura valida) mas o
	// /auth/me diz 401 (ex.: user apagado quando a BD foi recriada). Sem isto a
	// pessoa ficava presa numa pagina vazia, sem icone de perfil nem botao de
	// logout para sair. Limpamos o cookie e so navegamos se a limpeza funcionou,
	// senao o middleware mandava-nos de volta para ca em loop.
	// So agimos quando a sessao foi CONFIRMADA invalida (401). 
	useEffect(() => {
		if (loading || user) return;
		if (!sessionExpired) return; // falha passageira: nao expulsar
		if (loggingOut.current) return; // ja estamos a sair, nao repetir
		loggingOut.current = true;

		fetch("/api/auth/logout", { method: "POST" })
			.then((res) => {
				if (res.ok) {
					router.replace("/log_in");
					router.refresh();
				} else {
					loggingOut.current = false; // falhou: deixa tentar de novo
				}
			})
			.catch(() => {
				loggingOut.current = false;
			});
	}, [loading, user, sessionExpired, router]);

	if (loading || !user) {
		return null;
	}

	return <>{children}</>;
}

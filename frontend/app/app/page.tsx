import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import Login from "./log_in/page";
import { isValidSessionToken } from "./lib/session";

// A decisao logado/deslogado e feita AQUI e nao so no middleware: usar
// cookies() torna a pagina dinamica, senao o Next punha o payload estatico
// (a pagina de login) no cache do router do cliente e quem clicava no icone
// do site via a pagina de login mesmo estando autenticado.
export default async function LandingPage() {
	const token = (await cookies()).get("access_token")?.value;

	if (await isValidSessionToken(token)) {
		redirect("/gamerooms");
	}

	return <Login />;
}

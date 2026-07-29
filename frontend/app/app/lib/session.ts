import { jwtVerify } from "jose";

// Validacao do JWT da sessao, partilhada pelo proxy (middleware) e pela
// landing page — assim o criterio de "esta logado" nunca diverge entre os dois.
export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
	if (!token) return false;

	const secret = process.env.JWT_SECRET;
	if (!secret) {
		throw new Error("JWT_SECRET não está definida no .env");
	}

	try {
		await jwtVerify(token, new TextEncoder().encode(secret));
		return true;
	} catch {
		return false;
	}
}

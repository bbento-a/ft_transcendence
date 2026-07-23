export type ApiResult<T> =
	| { ok: true; data: T }
	| { ok: false; errors: string[] };

const OFFLINE_ERROR = "Server unavailable, please try again in a moment.";

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<ApiResult<T>> {
	let res: Response;

	try {
		res = await fetch(`/api${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch {
		// rede abaixo ou pedido cancelado, nem chegou a haver resposta
		return { ok: false, errors: [OFFLINE_ERROR] };
	}

	// quando o backend esta em baixo o nginx responde 502 com html, e o json() rebentava
	let data: any;
	try {
		data = await res.json();
	} catch {
		return { ok: false, errors: [OFFLINE_ERROR] };
	}

	if (res.ok) {
		return { ok: true, data };
	}

	// ValidationPipe devolve message como array; exceções do Nest devolvem uma string
	if (Array.isArray(data?.message))
		return { ok: false, errors: data.message };

	return { ok: false, errors: [data?.message ?? OFFLINE_ERROR] };
}

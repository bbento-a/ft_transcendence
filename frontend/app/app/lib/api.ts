// o texto vive no formErrors.ts, onde esta o padrao que o traduz
import { OFFLINE_MESSAGE } from "./formErrors";

export type ApiResult<T> =
	| { ok: true; data: T }
	| { ok: false; errors: string[] };

async function apiRequest<T = unknown>(method: "POST" | "PATCH", path: string, body: unknown): Promise<ApiResult<T>> {
	let res: Response;

	try {
		res = await fetch(`/api${path}`, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch {
		// rede abaixo ou pedido cancelado, nem chegou a haver resposta
		return { ok: false, errors: [OFFLINE_MESSAGE] };
	}

	// quando o backend esta em baixo o nginx responde 502 com html, e o json() rebentava
	let data: any;
	try {
		data = await res.json();
	} catch {
		return { ok: false, errors: [OFFLINE_MESSAGE] };
	}

	if (res.ok) {
		return { ok: true, data };
	}

	// ValidationPipe devolve message como array; exceções do Nest devolvem uma string
	if (Array.isArray(data?.message))
		return { ok: false, errors: data.message };

	return { ok: false, errors: [data?.message ?? OFFLINE_MESSAGE] };
}

export function apiPost<T = unknown>(path: string, body: unknown): Promise<ApiResult<T>> {
	return apiRequest<T>("POST", path, body);
}

export function apiPatch<T = unknown>(path: string, body: unknown): Promise<ApiResult<T>> {
	return apiRequest<T>("PATCH", path, body);
}

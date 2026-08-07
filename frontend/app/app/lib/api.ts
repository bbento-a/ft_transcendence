// os textos vivem no formErrors.ts, onde estao os padroes que os traduzem
import { OFFLINE_MESSAGE, TOO_LARGE_MESSAGE, RATE_LIMITED_MESSAGE } from "./formErrors";

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

	/*
	Decididos pelo codigo, antes de tentar ler o corpo.
	O 413 pode nem sequer vir do backend: acima do client_max_body_size e o nginx
	que responde, e responde em HTML. Sem este caso o json() rebentava e o catch
	la em baixo dizia "servidor indisponivel" a quem so tinha escrito texto a
	mais. O 429 vem do throttler e o corpo nao acrescenta nada ao codigo.
	*/
	if (res.status === 413)
		return { ok: false, errors: [TOO_LARGE_MESSAGE] };
	if (res.status === 429)
		return { ok: false, errors: [RATE_LIMITED_MESSAGE] };

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

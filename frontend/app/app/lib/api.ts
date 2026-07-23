export type ApiResult<T> =
	| { ok: true; data: T }
	| { ok: false; errors: string[] };

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<ApiResult<T>> {
	const res = await fetch(`/api${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	const data = await res.json();

	if (res.ok) {
		return { ok: true, data };
	}

	// ValidationPipe devolve message como array; exceções do Nest devolvem uma string
	return { ok: false, errors: Array.isArray(data.message) ? data.message : [data.message] };
}

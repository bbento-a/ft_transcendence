/*
Mostra um erro de cada vez em vez de despejar a lista toda que o backend manda,
e mostra-o no idioma de quem esta a ver: o que anda pelo estado dos forms e uma
chave do namespace "formErrors" (ver messages/*.json), nunca a frase ja escrita.

O backend responde sempre em ingles (mensagens do class-validator e das
excecoes do Nest), por isso e aqui que a mensagem crua vira chave — a mesma
ideia do gateway do jogo, que ja manda chaves em vez de texto (ver
BackendMessage em types/game.ts). Cada form so declara a ordem por que quer
mostrar os erros; a logica de escolher qual mostrar e a mesma em todo o lado.
*/

export type ErrorKey = {
	key: string;
	// numeros apanhados a propria mensagem do backend (ex.: minimo de
	// caracteres), para os limites continuarem a viver so no userFields.ts em
	// vez de ficarem copiados em cada traducao
	params?: Record<string, string | number>;
};

/*
Mensagem do backend -> chave da traducao (o nome da entrada). O grupo (\d+) e
opcional; quando existe, o numero apanhado chega a traducao como {n}.

Os padroes estao presos ao verbo (must/cannot/can only) para nao apanharem
tambem o "Username already in use.". Nao ha aqui "Email cannot be empty":
o email vazio nunca chega ao backend, o @IsEmail devolve a mesma mensagem para
vazio e para mal formatado (e por isso que existe o firstEmptyField).

Source of truth das mensagens: backend/app/src/auth/dto/userFields.ts e as
excecoes em backend/app/src/auth/auth.service.ts.
*/
const PATTERNS = {
	usernameEmpty: /^Username cannot be empty/,
	usernameMin: /^Username must be at least (\d+)/,
	usernameMax: /^Username cannot exceed (\d+)/,
	usernamePattern: /^Username can only contain/,
	usernameTaken: /^Username already in use/,

	emailInvalid: /email address/,
	emailTaken: /^Email already in use/,
	emailFromProvider: /^Email is managed by your login provider/,

	passwordEmpty: /^Password cannot be empty/,
	passwordMin: /^Password must be at least (\d+)/,
	passwordMax: /^Password cannot exceed (\d+)/,

	currentPasswordEmpty: /^Current password cannot be empty/,
	currentPasswordRequired: /^Current password is required/,
	// o login manda "Invalid Credentials" e o update de perfil "Invalid
	// credentials.", a mesma ideia com maiuscula diferente
	invalidCredentials: /^Invalid [Cc]redentials/,
	// cookie valido de um user que ja nao existe (ex.: BD recriada): nao e um
	// erro do form, e sessao para deitar fora
	sessionExpired: /^Session user no longer exists/,
	// este nao vem do backend, e o proprio api.ts que o poe quando nem chegou a
	// haver resposta (ver OFFLINE_MESSAGE)
	offline: /^Server unavailable/,
} as const;

// so estes nomes podem entrar na ordem de um form, um erro de escrita nao
// compila em vez de so nunca dar match
export type ErrorName = keyof typeof PATTERNS;

/*
O api.ts poe isto em errors[] quando o servidor nao respondeu de todo (rede
abaixo, 502 do nginx com html em vez de json). Vive aqui, e nao la, para nao
poder divergir do padrao "offline" acima — e assim passa pelo pickError como
qualquer outra mensagem, em vez de ser o unico ingles a chegar ao ecra.
*/
export const OFFLINE_MESSAGE = "Server unavailable, please try again in a moment.";

// Erros que so o cliente conhece: os campos vazios nem chegam a ir ao backend
// e o resto sao falhas de rede ou coisas que o servidor nem sabe (ex.: o campo
// de confirmar password).
export const EMPTY_USERNAME: ErrorKey = { key: "usernameEmpty" };
export const EMPTY_EMAIL: ErrorKey = { key: "emailEmpty" };
export const EMPTY_PASSWORD: ErrorKey = { key: "passwordEmpty" };
export const GENERIC_ERROR: ErrorKey = { key: "generic" };
export const PASSWORD_MISMATCH: ErrorKey = { key: "passwordMismatch" };
export const NO_CHANGES: ErrorKey = { key: "noChanges" };
export const AVATAR_ERROR: ErrorKey = { key: "avatarError" };

export type EmptyCheck = {
	value: string;
	error: ErrorKey;
	// por defeito faz trim antes de comparar; passa false nas passwords,
	// onde os espacos podem fazer parte do valor
	trim?: boolean;
};

/*
Corre as verificacoes de campo vazio pela ordem dada e devolve o erro da
primeira que falhar. Feito no cliente porque o @IsEmail do backend devolve a
mesma mensagem para email vazio e para email mal formatado, e nao ha maneira de
distinguir os dois a partir da resposta.
*/
export const firstEmptyField = (fields: EmptyCheck[]): ErrorKey | null => {
	for (const field of fields) {
		const value = field.trim === false ? field.value : field.value.trim();

		if (!value)
			return field.error;
	}
	return null;
};

/*
Percorre a ordem de prioridade do form (nao os erros) e devolve a chave do
primeiro padrao que der match. Assim a ordem por que o backend mandou os erros e
irrelevante, quem manda e o array `order`.
Atencao: ganha o primeiro match, logo os padroes especificos tem de vir antes
dos genericos.
*/
export const pickError = (errors: string[], order: ErrorName[]): ErrorKey | null => {
	if (errors.length === 0)
		return null;

	for (const name of order) {
		const pattern = PATTERNS[name];

		for (const message of errors) {
			const match = pattern.exec(message);

			if (!match)
				continue;
			// so os limites (min/max) e que trazem numero na mensagem
			return match[1] ? { key: name, params: { n: Number(match[1]) } } : { key: name };
		}
	}
	// mensagens sem padrao definido (ex.: "password must be a string" do
	// @IsString, que so aparece a quem mexer no pedido a mao): despejar ingles
	// cru no meio de uma pagina traduzida era pior que uma mensagem generica
	return GENERIC_ERROR;
};

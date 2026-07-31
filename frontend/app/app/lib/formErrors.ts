/*
Mostra um erro de cada vez em vez de despejar a lista toda que o backend manda.
Cada form define a sua ordem de prioridade (um array de RegExp) e chama estas
funcoes; a logica de escolher qual mostrar e a mesma em todo o lado.
*/

export const EMPTY_USERNAME = "Username cannot be empty.";
export const EMPTY_EMAIL = "Email cannot be empty.";
export const EMPTY_PASSWORD = "Password cannot be empty.";

export const GENERIC_ERROR = "Something went wrong, please try again.";

export type EmptyCheck = {
	value: string;
	message: string;
	// por defeito faz trim antes de comparar; passa false nas passwords,
	// onde os espacos podem fazer parte do valor
	trim?: boolean;
};

/*
Corre as verificacoes de campo vazio pela ordem dada e devolve a mensagem da
primeira que falhar. Feito no cliente porque o @IsEmail do backend devolve a
mesma mensagem para email vazio e para email mal formatado, e nao ha maneira de
distinguir os dois a partir da resposta.
*/
export const firstEmptyField = (fields: EmptyCheck[]): string | null => {
	for (const field of fields) {
		const value = field.trim === false ? field.value : field.value.trim();

		if (!value)
			return field.message;
	}
	return null;
};

/*
Percorre as regras por ordem de prioridade (nao os erros) e devolve a primeira
mensagem que der match. Assim a ordem por que o backend mandou os erros e
irrelevante, quem manda e o array `order`.
Atencao: ganha o primeiro match, logo os padroes especificos tem de vir antes
dos genericos.
*/
export const pickError = (errors: string[], order: RegExp[]): string | null => {
	if (errors.length === 0)
		return null;

	for (const rule of order) {
		const match = errors.find((msg) => rule.test(msg));

		if (match)
			return match;
	}
	// mensagens sem regra definida (ex.: "username must be a string" do @IsString)
	return errors[0];
};

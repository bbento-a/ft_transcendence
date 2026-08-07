import { registerDecorator, ValidationOptions } from 'class-validator';

/*
Regras dos campos de utilizador num sitio so. O RegisterDto, o UpdateUserDto e o
LoginDto importam daqui para nao poderem divergir: antes o registo cortava o
username aos 12 e o update deixava ir aos 20, ou seja dava para ficar com um
username que o registo nunca teria aceitado.

As mensagens sao construidas a partir dos mesmos numeros, entao o texto e o
limite tambem nao podem ficar fora de sincronia. Se mudares um limite, muda so
aqui: o frontend faz match pelo inicio da mensagem (ver PATTERNS em
frontend/app/app/lib/formErrors.ts), nao pelo numero, e apanha o numero a
propria mensagem para o mostrar traduzido. Se mudares o TEXTO, muda la o padrao.
*/

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 12;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

// em CARACTERES (ver MinCharacters mais abaixo)
export const PASSWORD_MIN = 6;
// em BYTES: limite do bcrypt, a partir dos 72 bytes o resto da password e
// ignorado em silencio -- duas passwords com os mesmos 72 bytes iniciais abrem
// a mesma conta. Por isso e recusada aqui em vez de ser cortada la dentro.
export const PASSWORD_MAX_BYTES = 72;

export const USERNAME_EMPTY_MSG = 'Username cannot be empty.';
export const USERNAME_MIN_MSG = `Username must be at least ${USERNAME_MIN} characters long.`;
export const USERNAME_MAX_MSG = `Username cannot exceed ${USERNAME_MAX} characters.`;
export const USERNAME_PATTERN_MSG = 'Username can only contain letters, numbers and underscores.';

export const EMAIL_INVALID_MSG = 'Please provide a valid email address.';

export const PASSWORD_EMPTY_MSG = 'Password cannot be empty.';
export const PASSWORD_MIN_MSG = `Password must be at least ${PASSWORD_MIN} characters long.`;
// sem numero na mensagem de proposito: o limite e em bytes, e "72 bytes" nao
// diz nada a quem so quer escolher uma password
export const PASSWORD_MAX_MSG = 'Password is too long.';

export const CURRENT_PASSWORD_EMPTY_MSG = 'Current password cannot be empty.';

/*
Forma canonica de um username. Guardamos SEMPRE assim (registo, update e contas
OAuth) para nao poderem existir um "Bento" e um "bento" como contas diferentes.

Como tudo o que esta gravado ja passou por aqui, quem PROCURA por nome so tem de
normalizar o que lhe escreveram e comparar exatamente -- e o que a pesquisa do
dashboard faz. Nao ha necessidade de comparacoes insensiveis a maiusculas, que
alem de mais lentas nao usariam o indice unico do username.

Nao faz mais limpeza nenhuma: os DTO ja rejeitam tudo o que nao seja
[a-zA-Z0-9_], por isso aqui nao ha espacos nem simbolos para tratar.
*/
export const normalizeUsername = (username: string): string =>
  username.trim().toLowerCase();

/*
Porque e que a password nao usa o @MinLength/@MaxLength do class-validator:
esses contam String.length, que sao unidades UTF-16 -- nem caracteres nem bytes.
Um emoji conta 2. Na pratica isso queria dizer que

  "🔥🔥🔥"        passava o minimo de 6 sendo 3 caracteres;
  36 emojis      passavam o maximo de 72 sendo 144 bytes.

O segundo caso era o mau: o bcrypt le no maximo 72 BYTES e ignora o resto sem
avisar, portanto metade da password nao contava para nada.

*/
export function MinCharacters(min: number, options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'minCharacters',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        // o spread parte a string em code points, ao contrario do .length
        validate: (value: unknown) =>
          typeof value === 'string' && [...value].length >= min,
      },
    });
  };
}

export function MaxBytes(max: number, options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'maxBytes',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max,
      },
    });
  };
}

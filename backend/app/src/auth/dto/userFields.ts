/*
Regras dos campos de utilizador num sitio so. O RegisterDto, o UpdateUserDto e o
LoginDto importam daqui para nao poderem divergir: antes o registo cortava o
username aos 12 e o update deixava ir aos 20, ou seja dava para ficar com um
username que o registo nunca teria aceitado.

As mensagens sao construidas a partir dos mesmos numeros, entao o texto e o
limite tambem nao podem ficar fora de sincronia. Se mudares um limite, muda so
aqui: o frontend faz match pelo inicio da mensagem (ver ERROR_ORDER em
formErrors.ts), nao pelo numero, por isso continua a funcionar.
*/

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 12;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export const PASSWORD_MIN = 6;
// limite do bcrypt: a partir dos 72 bytes o resto da password e ignorado
export const PASSWORD_MAX = 72;

export const USERNAME_EMPTY_MSG = 'Username cannot be empty.';
export const USERNAME_MIN_MSG = `Username must be at least ${USERNAME_MIN} characters long.`;
export const USERNAME_MAX_MSG = `Username cannot exceed ${USERNAME_MAX} characters.`;
export const USERNAME_PATTERN_MSG = 'Username can only contain letters, numbers and underscores.';

export const EMAIL_INVALID_MSG = 'Please provide a valid email address.';

export const PASSWORD_EMPTY_MSG = 'Password cannot be empty.';
export const PASSWORD_MIN_MSG = `Password must be at least ${PASSWORD_MIN} characters long.`;
export const PASSWORD_MAX_MSG = `Password cannot exceed ${PASSWORD_MAX} characters.`;

export const CURRENT_PASSWORD_EMPTY_MSG = 'Current password cannot be empty.';

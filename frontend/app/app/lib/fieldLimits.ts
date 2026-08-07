/*
Tetos dos campos de texto, so para o browser travar o que se escreve ANTES de
virar pedido. Sem isto dava para colar megabytes num campo de 12 caracteres: o
pedido saia na mesma e era o nginx a recusa-lo com uma pagina de erro em HTML,
que o api.ts nao consegue ler como json -- e a pessoa via "servidor
indisponivel" em vez de "o nome e demasiado longo".

Isto e conforto, nao validacao: quem manda continua a ser o backend (ver
userFields.ts). Por isso so ha aqui maximos, nunca minimos -- avisar que faltam
caracteres enquanto se escreve so estorva.

Se mudares um limite no backend, muda aqui tambem; um numero a mais deste lado
nao abre buraco nenhum (o backend recusa na mesma), so deixa a caixa de texto
aceitar mais do que devia.
*/

export const USERNAME_MAX = 12;

// limite do proprio formato de email (RFC 5321)
export const EMAIL_MAX = 254;

// o backend conta 72 BYTES, nao caracteres: uma password so de emojis bate no
// limite dele muito antes de bater neste. Aqui o numero e generoso de proposito
// -- serve para travar disparates, nao para replicar a regra.
export const PASSWORD_MAX = 72;

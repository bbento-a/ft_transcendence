// src/auth/dto/register.dto.ts
import { IsEmail, IsString, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  USERNAME_MIN, USERNAME_MAX, USERNAME_PATTERN,
  USERNAME_EMPTY_MSG, USERNAME_MIN_MSG, USERNAME_MAX_MSG, USERNAME_PATTERN_MSG,
  EMAIL_INVALID_MSG,
  PASSWORD_MIN, PASSWORD_MAX_BYTES, PASSWORD_EMPTY_MSG, PASSWORD_MIN_MSG, PASSWORD_MAX_MSG,
  MinCharacters, MaxBytes,
} from './userFields';

export class RegisterDto {

    /*
    Se alguem partir insto pago um jantar lmao
    Remover espaços antes e depois
    IsString verifica se o type e uma string value === string
    IsNotEmpty Rejeita strings vazias !== ""
    Apos o trim tem de respeitar o USERNAME_MIN e o USERNAME_MAX
     Matches so caracteres validos

    ! significa que estou dizer ao compilador que vou atribuir valor mais tarde

    Os limites e as mensagens vem do userFields.ts, partilhados com o UpdateUserDto
    */
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty({ message: USERNAME_EMPTY_MSG })
  @MinLength(USERNAME_MIN, { message: USERNAME_MIN_MSG })
  @MaxLength(USERNAME_MAX, { message: USERNAME_MAX_MSG })
  @Matches(USERNAME_PATTERN, { message: USERNAME_PATTERN_MSG })
  username!: string;


  @IsEmail({}, { message: EMAIL_INVALID_MSG })
  email!: string;

  // Sem @Matches: uma password pode ter o que lhe apetecer (emojis, espacos,
  // acentos). O que conta e o TAMANHO, e conta-se como deve ser -- ver o
  // comentario do MinCharacters/MaxBytes no userFields.ts
  @IsString()
  @IsNotEmpty({ message: PASSWORD_EMPTY_MSG })
  @MinCharacters(PASSWORD_MIN, { message: PASSWORD_MIN_MSG })
  @MaxBytes(PASSWORD_MAX_BYTES, { message: PASSWORD_MAX_MSG })
  password!: string;
}

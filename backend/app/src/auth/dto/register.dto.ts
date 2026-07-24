// src/auth/dto/register.dto.ts
import { IsEmail, IsString, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {

    /*
    Se alguem partir insto pago um jantar lmao
    Remover espaços antes e depois 
    IsString verifica se o type e uma string value === string
    IsNotEmpty Rejeita strings vazias !== ""
    Apos o trim tem de ter no minimo 3 caracteres
    maximo 20 caracteres
     Matches so caracteres validos

    ! significa que estou dizer ao compilador que vou atribuir valor mais tarde
    */
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty({ message: 'Username cannot be empty.' })
  @MinLength(3, { message: 'Username must be at least 3 characters long.' })
  @MaxLength(12, { message: 'Username cannot exceed 12 characters.' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers and underscores.' })
  username!: string;


  @IsEmail({}, { message: 'Please provide a valid email address.' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password cannot be empty.' })
  @MinLength(6, { message: 'Password must be at least 6 characters long.' })
  @MaxLength(72, { message: 'Password cannot exceed 72 characters.' })
  password!: string;
}
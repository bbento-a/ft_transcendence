import { IsEmail, IsString } from "class-validator";
import { EMAIL_INVALID_MSG, PASSWORD_MIN, PASSWORD_MIN_MSG, MinCharacters } from "./userFields";

// Limites e mensagens partilhados com o RegisterDto, ver userFields.ts
export class LoginDto {
    @IsEmail({}, { message: EMAIL_INVALID_MSG })
    email!: string;

    // A mesma contagem do registo: se aqui contasse unidades UTF-16 e la
    // caracteres, havia passwords aceites a criar a conta que nao dava para usar
    // a entrar nela
    @IsString()
    @MinCharacters(PASSWORD_MIN, { message: PASSWORD_MIN_MSG })
    password!: string;
}

import { IsEmail, IsString, MinLength } from "class-validator";
import { EMAIL_INVALID_MSG, PASSWORD_MIN, PASSWORD_MIN_MSG } from "./userFields";

// Limites e mensagens partilhados com o RegisterDto, ver userFields.ts
export class LoginDto {
    @IsEmail({}, { message: EMAIL_INVALID_MSG })
    email!: string;

    @IsString()
    @MinLength(PASSWORD_MIN, { message: PASSWORD_MIN_MSG })
    password!: string;
}

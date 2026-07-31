import { IsString, MinLength, MaxLength, IsNotEmpty, Matches, IsOptional, IsUrl, IsEmail } from "class-validator";
import { Transform } from 'class-transformer';
import {
    USERNAME_MIN, USERNAME_MAX, USERNAME_PATTERN,
    USERNAME_EMPTY_MSG, USERNAME_MIN_MSG, USERNAME_MAX_MSG, USERNAME_PATTERN_MSG,
    EMAIL_INVALID_MSG,
    PASSWORD_MIN, PASSWORD_MAX, PASSWORD_MIN_MSG, PASSWORD_MAX_MSG,
    CURRENT_PASSWORD_EMPTY_MSG,
} from './userFields';

// Limites e mensagens partilhados com o RegisterDto, ver userFields.ts
export class UpdateUserDto {

    @IsOptional()
    @Transform(({ value }) => value?.trim())
    @IsString()
    @IsNotEmpty({ message: USERNAME_EMPTY_MSG })
    @MinLength(USERNAME_MIN, { message: USERNAME_MIN_MSG })
    @MaxLength(USERNAME_MAX, { message: USERNAME_MAX_MSG })
    @Matches(USERNAME_PATTERN, { message: USERNAME_PATTERN_MSG })
    username!: string;

    @IsOptional()
    @IsEmail({}, { message: EMAIL_INVALID_MSG })
    email?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty({ message: CURRENT_PASSWORD_EMPTY_MSG })
    currentPassword?: string;

    @IsOptional()
    @IsString()
    @MinLength(PASSWORD_MIN, { message: PASSWORD_MIN_MSG })
    @MaxLength(PASSWORD_MAX, { message: PASSWORD_MAX_MSG })
    newPassword?: string;

    @IsOptional()
    @IsUrl()
    avatarUrl?: string;
}

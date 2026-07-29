import { IsString, MinLength, MaxLength, IsNotEmpty, Matches, IsOptional, IsUrl, IsEmail } from "class-validator";
import { Transform } from 'class-transformer';

export class UpdateUserDto {

    @IsOptional()
    @Transform(({ value }) => value?.trim())
    @IsString()
    @IsNotEmpty({ message: 'Username cannot be empty.' })
    @MinLength(3, { message: 'Username must be at least 3 characters long.' })
    @MaxLength(20, { message: 'Username cannot exceed 20 characters.' })
    @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers and underscores.' })
    username!: string;

    @IsOptional()
    @IsEmail({}, { message: 'Please provide a valid email address.' })
    email?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty({ message: 'Current password cannot be empty.' })
    currentPassword?: string;

    @IsOptional()
    @IsString()
    @MinLength(6, { message: 'Password must be at least 6 characters long.' })
    @MaxLength(72, { message: 'Password cannot exceed 72 characters.' })
    newPassword?: string;

    @IsOptional()
    @IsUrl()
    avatarUrl?: string;
}
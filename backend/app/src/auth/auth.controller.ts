import { Controller, Post, Body, Res, UseGuards, Get,Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { Request,Response } from 'express';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { access_token, ...body } = await this.authService.register(dto);

    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24, //24 horas, igual ao expiresIn do JWT
    });

    return body;
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { access_token } = await this.authService.login(dto);

    res.cookie('access_token', access_token, {
      httpOnly: true,//nao deixa o js ler no frontend
      secure: true, // so envia em https
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24, //24 horas, igual ao expiresIn do JWT
    });

    return { message: 'Login successful' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getProfile(@Req() req:Request)
  {
    return req.user;
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  logout(@Res({passthrough: true}) res: Response)
  {
    //Sobrescrevemos a cookie com informaçao do passado assim o bro vai de arrasta
    res.cookie('access_token','',{
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expires: new Date(0),
    });
    return {message: 'Logout efetuado com sucesso familia'};
  }
}
import { Controller, Post, Body, Res, UseGuards, Get, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { Request,Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { OAuthProfile } from './types/oauth-profile.type'

export type OAuthRequest = Request & {
  user?: OAuthProfile;
};

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
      maxAge: 1000 * 60 * 60, //1 hora
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
      maxAge: 1000 * 60 * 60, //1 hora
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
      secure: false,
      sameSite: 'lax',
      expires: new Date(0),
    });
    return {message: 'Logout efetuado com sucesso familia'};
  }

  @Get('google')
  //usa o google.strategy.ts que tem oq eu preciso da api do google.
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    return;
  }

  @Get('google/redir')
  @UseGuards(AuthGuard('google'))
  async googleLoginRedirect(@Req() req: OAuthRequest, @Res({ passthrough: true }) res: Response) {
    if (!req.user)
      throw new UnauthorizedException('Missing OAuth user');
    const result = await this.authService.googleLogin(req.user);

    res.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60,
    });

    return { message: 'Google login successful' };
  }

  @Get('42')
  //usa o 42.strategy.ts que tem oq eu preciso da api da 42.
  @UseGuards(AuthGuard('42'))
  fortyTwoLogin() {
    return;
  }

  @Get('42/redir')
  @UseGuards(AuthGuard('42'))
  async fortyTwoLoginRedirect(@Req() req: OAuthRequest, @Res({ passthrough: true }) res: Response) {
    if (!req.user)
      throw new UnauthorizedException('Missing OAuth user');
    const result = await this.authService.fortyTwoLogin(req.user);

    res.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60,
    });

    return { message: '42 login successful' };
  }
}
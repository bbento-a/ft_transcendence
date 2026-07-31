import { Controller, Post, Patch, Body, Res, UseGuards, Get,Req, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/updateUser.dto';
import type { Request,Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { OAuthProfile } from './types/oauth-profile.type'
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from "multer";

export type OAuthRequest = Request & {
  user?: OAuthProfile;
};

type JwtUser = {
	id: string;
	username: string;
};

type AuthRequest = Request & {
	user: JwtUser;
};

// Where the browser lands after a successful OAuth login.
const OAUTH_SUCCESS_REDIRECT = '/gamerooms';

// Session length; kept in one place so every auth path issues the same cookie.
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h, matches the JWT expiry

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Single source of truth for the auth cookie. Register, login and both OAuth
  // callbacks all use this, so the flags and lifetime can never drift apart.
  private setAuthCookie(res: Response, token: string) {
    res.cookie('access_token', token, {
      httpOnly: true,   // JS cannot read it (XSS protection)
      secure: true,     // HTTPS only
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
    });
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { access_token, ...body } = await this.authService.register(dto);
    this.setAuthCookie(res, access_token);
    return body;
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { access_token } = await this.authService.login(dto);
    this.setAuthCookie(res, access_token);
    return { message: 'Login successful' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getProfile(@Req() req: Request) {
    return this.authService.getMe((req.user as { id: string }).id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(AuthGuard('jwt'))
  @Patch('me')
  updateProfile(@Req() req: Request, @Body() dto: UpdateUserDto) {
    return this.authService.updateUserData((req.user as { id: string }).id, dto);
  }

  @UseGuards(AuthGuard("jwt"))
  @Post("avatar")
  @UseInterceptors(
    FileInterceptor("avatar", {
      storage: diskStorage({
        destination: "./uploads/avatars",
        filename: (req, file, cb) => {
          const user = req.user as JwtUser;
          const ext = file.originalname.split(".").pop();
          
          cb(null, `${user.id}${Date.now()}.${ext}`);
        },
      }),
    }),
  )
  async uploadAvatar(
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const avatarUrl = `/api/uploads/avatars/${file.filename}`;
  
    return this.authService.updateAvatar(
      req.user.id,
      avatarUrl,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  logout(@Res({passthrough: true}) res: Response)
  {
    // Overwrite the cookie with one that has already expired. The flags must
    // match setAuthCookie or the browser will not consider it the same cookie.
    res.cookie('access_token', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expires: new Date(0),
    });
    return { message: 'Logout efetuado com sucesso familia' };
  }

  @Get('google')
  //usa o google.strategy.ts que tem oq eu preciso da api do google.
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    return;
  }

  // Google redirects the browser here after consent. We set the same auth cookie
  // as login/register, then REDIRECT the browser to the app — returning JSON
  // here would just show the user a raw JSON page.
  @Get('google/redir')
  @UseGuards(AuthGuard('google'))
  async googleLoginRedirect(@Req() req: OAuthRequest, @Res() res: Response) {
    if (!req.user)
      throw new UnauthorizedException('Missing OAuth user');
    const { access_token } = await this.authService.googleLogin(req.user);

    this.setAuthCookie(res, access_token);
    res.redirect(OAUTH_SUCCESS_REDIRECT);
  }

  @Get('42')
  //usa o 42.strategy.ts que tem oq eu preciso da api da 42.
  @UseGuards(AuthGuard('42'))
  fortyTwoLogin() {
    return;
  }

  @Get('42/redir')
  @UseGuards(AuthGuard('42'))
  async fortyTwoLoginRedirect(@Req() req: OAuthRequest, @Res() res: Response) {
    if (!req.user)
      throw new UnauthorizedException('Missing OAuth user');
    const { access_token } = await this.authService.fortyTwoLogin(req.user);

    this.setAuthCookie(res, access_token);
    res.redirect(OAUTH_SUCCESS_REDIRECT);
  }
}

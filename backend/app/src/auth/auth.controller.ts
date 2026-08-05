import { Controller, Post, Patch, Body, Res, UseGuards, Get,Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
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
import { OptionalJwtAuthGuard } from './optjwt.strategy';

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

// Extensao gravada no disco, escolhida pelo mimetype e nao pelo nome que o
// browser mandou: ha ficheiros sem extensao nenhuma, e o originalname vem do
// cliente (nao e de confiar para construir caminhos).
const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5MB

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

  // Fora do rate limit: e so um check de sessao (JWT + 1 leitura), chamado a
  // cada carregamento de pagina.
  @SkipThrottle()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('me')
  getProfile(@Req() req: Request) {
    if (!req.user) {
      return null;
    }

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
          const ext = AVATAR_EXTENSIONS[file.mimetype];

          cb(null, `${user.id}${Date.now()}.${ext}`);
        },
      }),
      // So imagens, e so as que sabemos servir. Sem isto qualquer ficheiro era
      // aceite e ficava gravado com uma extensao que ninguem consegue mostrar.
      fileFilter: (req, file, cb) => {
        cb(null, file.mimetype in AVATAR_EXTENSIONS);
      },
      limits: { fileSize: AVATAR_MAX_BYTES },
    }),
  )
  async uploadAvatar(
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // O fileFilter rejeita em silencio (nao ha ficheiro), e o campo pode nem
    // vir no form. Sem este guard rebentava em file.filename com um 500.
    if (!file) {
      throw new BadRequestException('Avatar must be a JPEG, PNG, GIF or WebP image under 5MB.');
    }

    const avatarUrl = `/api/uploads/avatars/${file.filename}`;

    await this.authService.updateAvatar(req.user.id, avatarUrl);

    // Devolvemos o URL novo: o frontend faz refresh do /me a seguir, mas assim
    // a resposta nao e um corpo vazio e da para usar sem outro pedido.
    return { avatarUrl };
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

import { Injectable, ConflictException, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { OAuthProfile } from './types/oauth-profile.type';
import { UpdateUserDto } from './dto/updateUser.dto';
import { USERNAME_MAX } from './dto/userFields';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService,
              private jwtService: JwtService,
              ) {}

  private async signToken(user: { id: string; username: string }) {
    const payload = { sub: user.id, username: user.username };
    return this.jwtService.signAsync(payload);
  }

  async login(dto: LoginDto)
  {
    //Checar Email (normalizado para minusculas, tal como no register)
    const user = await this.prisma.user.findUnique({where: {email: dto.email.toLowerCase()}});

    //Email nao existe na base de dados
    if(!user)
    {
      throw new UnauthorizedException('Invalid Credentials');
    }

    //User existe mans registou-se via OAuth (sem password local)
    if (!user.password)
    {
      throw new UnauthorizedException('Invalid Credentials');
    }


    //Vamos verificar a pass que esta no dto(plan password) com a que esta hashed
    const isPasswordValid = await bcrypt.compare(dto.password,user.password);

    if(!isPasswordValid)
    {
      throw new UnauthorizedException('Invalid Credentials');
    }

    //Esta tudo o User existe
    return{
      access_token: await this.signToken(user),
    };
  }


  async register(dto: RegisterDto) {
    // Normalize email to avoid duplicate accounts differing only in case
    const email = dto.email.toLowerCase();

    // Check if email or username are already taken (parallel queries)
    const [emailTaken, usernameTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.user.findUnique({ where: { username: dto.username } }),
    ]);

    /*
    Mensagens separadas de proposito. A mensagem vaga nao escondia nada: basta
    registar com um username aleatorio para isolar o email e ler a resposta.
    So um fluxo de verificacao por email fecharia isso, por isso mais vale o
    utilizador perceber qual e o campo em conflito. Username primeiro, para
    seguir a ordem dos campos do form.
    */
    if (usernameTaken) {
      throw new ConflictException('Username already in use.');
    }

    if (emailTaken) {
      throw new ConflictException('Email already in use.');
    }

    // Hash password before storing (never store plaintext)
    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const newUser = await this.prisma.user.create({
      data: {
        username: dto.username,
        email,
        password: hashedPassword,
      },
    });

    // Never return the password hash, even hashed
    return {
      message: 'User registered successfully.',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
      access_token: await this.signToken(newUser),
    };
  }

  async googleLogin(profile: OAuthProfile) {
    return this.findOrCreateOAuthUser({
      provider: 'google',
      providerId: profile.id,
      email: profile.email,
      username: profile.name,
      avatarUrl: profile.picture,
    });
  }

  async fortyTwoLogin(profile: OAuthProfile) {
    return this.findOrCreateOAuthUser({
      provider: '42',
      providerId: profile.id,
      email: profile.email,
      username: profile.name,
      avatarUrl: profile.picture,
    });
  }

  private async findOrCreateOAuthUser(input: {
    provider: 'google' | '42';
    providerId: string;
    email?: string;
    username?: string;
    avatarUrl?: string;
  }) {
    let user = input.provider === 'google'
    ? await this.prisma.user.findUnique({ where: { googleId: input.providerId } })
    : await this.prisma.user.findUnique({ where: { fortyTwoId: input.providerId } });
  
    if (!user && input.email) {
      user = await this.prisma.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });
    }
  
    if (!user) {
      const baseUsername =
        input.username?.trim() ||
        input.email?.split('@')[0] ||
        `${input.provider}_${input.providerId.slice(0, 8)}`;
    
      const username = await this.makeUniqueUsername(baseUsername);
      const email =
        input.email?.toLowerCase() ||
        `${input.providerId}@${input.provider}.oauth`;
    
      user = await this.prisma.user.create({
        data: {
          username,
          email,
          googleId: input.provider === 'google' ? input.providerId : null,
          fortyTwoId: input.provider === '42' ? input.providerId : null,
          avatarUrl: input.avatarUrl,
          password: null,
        },
      });
    } else {
      const updateData: { googleId?: string; fortyTwoId?: string; avatarUrl?: string } = {};
    
      if (input.provider === 'google' && !user.googleId) updateData.googleId = input.providerId;
      if (input.provider === '42' && !user.fortyTwoId) updateData.fortyTwoId = input.providerId;
      if (input.avatarUrl && !user.avatarUrl) updateData.avatarUrl = input.avatarUrl;
    
      if (Object.keys(updateData).length) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      }
    }
  
    return this.signOAuthToken(user.id, user.username);
  }

  private async makeUniqueUsername(base: string) {
    const clean = (value: string) => value.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

    // O nome vem do provider e pode ser maior que o USERNAME_MAX; sem o corte
    // ficavamos com contas OAuth que o UpdateUserDto ja nao aceitava de volta
    let root = clean(base).slice(0, USERNAME_MAX);
    if (!root) root = 'user';

    let username = root;
    let i = 0;
    while (await this.prisma.user.findUnique({ where: { username } })) {
      i += 1;
      // abre espaco para o sufixo em vez de estourar o limite
      const suffix = `_${i}`;
      username = `${root.slice(0, USERNAME_MAX - suffix.length)}${suffix}`;
    }

    return username;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        password: true,
      },
    });

    // Token assinado por nos mas o user ja nao existe na BD (ex.: base de dados
    // recriada). Devolver null dava 200 vazio e o frontend ficava numa sessao
    // fantasma; 401 deixa o cliente limpar o cookie e voltar ao login.
    if (!user) throw new UnauthorizedException('Session user no longer exists.');

    // Nunca devolver o hash; so dizemos ao frontend se existe password local
    // para ele poder desativar a mudanca de password nas contas so-OAuth.
    const { password, ...rest } = user;
    return { ...rest, hasPassword: !!password };
  }

  async updateUserData(userId: string, dto: UpdateUserDto) {
    const data: any = {};

    if (dto.username) {
      const clean = dto.username.trim().replace(/\s+/g, '_').toLowerCase();

      const taken = await this.prisma.user.findUnique({ where: { username: clean } });
      if (taken && taken.id !== userId) {
        throw new ConflictException('Username already in use.');
      }

      data.username = clean;
    }

    if (dto.email || dto.newPassword) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      // Contas so-OAuth nao tem password local: email e password sao geridos
      // pelo provider (Google/42), por isso nao deixamos mudar nenhum dos dois aqui.
      const isOAuthOnly = !user?.password;

      if (dto.email) {
        if (isOAuthOnly) {
          throw new ForbiddenException('Email is managed by your login provider.');
        }

        // Normalize email to avoid duplicate accounts differing only in case
        const email = dto.email.toLowerCase();

        const taken = await this.prisma.user.findUnique({ where: { email } });
        if (taken && taken.id !== userId) {
          throw new ConflictException('Email already in use.');
        }

        data.email = email;
      }

      if (dto.newPassword) {
        if (!dto.currentPassword) {
          throw new BadRequestException('Current password is required to set a new password.');
        }

        // OAuth-only accounts have no password to verify against
        if (isOAuthOnly) {
          throw new UnauthorizedException('Invalid credentials.');
        }

        const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user!.password!);
        if (!isCurrentPasswordValid) {
          throw new UnauthorizedException('Invalid credentials.');
        }

        data.password = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
      }
    }

    if (dto.avatarUrl) {
      data.avatarUrl = dto.avatarUrl;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
      },
    });
  }
  private async signOAuthToken(userId: string, username: string) {
    return {
      access_token: await this.jwtService.signAsync({
        sub: userId,
        username,
      }),
    };
  }
  async updateAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        avatarUrl,
      },
    });
  }
}
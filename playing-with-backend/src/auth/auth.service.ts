import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';


const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService,
              private jwtService: JwtService,
              ) {}

  async login(dto: LoginDto)
  {
    //Checar Email
    const user = await this.prisma.user.findUnique({where: {email: dto.email}});

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
    const payload = {sub: user.id, username: user.username};

    return{
      access_token: await this.jwtService.signAsync(payload),
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

    if (emailTaken || usernameTaken) {
      throw new ConflictException('Credentials already in use.');
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
    };
  }
}
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
 constructor(configService: ConfigService) {
  const secret = configService.get<string>('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET não está definida no .env');
  }

  super({
    //Bora extrair o token da cookie
    jwtFromRequest: ExtractJwt.fromExtractors([
      (request: Request) => {
        let token = null;
        if (request && request.cookies) {
          token = request.cookies['access_token'];
        }
        return token;
      },
    ]),
    //Nao queremos cookies expirados
    ignoreExpiration: false,
    //Check para ver se estao a tentar falsificar a assinatura! Ela e sempre assinado JWT_SECRET que esta no .env
    secretOrKey: secret,
  });
}
  //Token valido e nao esta expirado gg 
  async validate(payload: any) {
    // devolveemos aqui req.user do controlador
    return { id: payload.sub, username: payload.username };
  }
}
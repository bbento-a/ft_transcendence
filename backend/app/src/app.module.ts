import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StatsModule } from './stats/stats.module';
import { ConfigModule } from '@nestjs/config';

/*

@Module e uma classe vazia, o objetivoe agrupar peças de codigo relacionadas
Ou seja e um ficheiro de ligaçao 

Como listei o AppController e o AppService o compilador agora sabe que estao a trabalhar juntos
*/
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Limite por omissao para toda a app. Conta TODOS os pedidos por IP juntos,
    // por isso 20/min era baixo demais para uso normal (navegar + /auth/me +
    // /stats/me + jogo davam 429 com facilidade, ainda mais em dev com o
    // StrictMode a duplicar efeitos). 100/min deixa folga e continua a travar
    // abuso. As rotas sensiveis (login/register) mantem o seu @Throttle apertado.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    GameModule, PrismaModule, AuthModule, StatsModule
  ],  //Modulos que este modulo vai precisar
  controllers: [AppController], //Controladores que pertencem a este modulo
  providers: [
    AppService, // Serviçoes que pertencem a este modulo
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})


export class AppModule {}

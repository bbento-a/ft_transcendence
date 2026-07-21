import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
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
    GameModule, PrismaModule, AuthModule
  ],  //Modulos que este modulo vai precisar
  controllers: [AppController], //Controladores que pertencem a este modulo
  providers: [AppService], // Serviçoes que pertencem a este modulo
})


export class AppModule {}

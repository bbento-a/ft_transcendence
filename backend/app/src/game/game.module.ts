import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';

// Sem controladores: o jogo todo passa pelo WebSocket (GameGateway), nao ha
// aqui nenhuma rota HTTP para servir.
@Module({
  imports: [
    JwtModule.register({
    secret: process.env.JWT_SECRET!,
    signOptions: { expiresIn: '1d' },
  }),
  ],
  providers: [GameService, GameGateway],
})

export class GameModule {}
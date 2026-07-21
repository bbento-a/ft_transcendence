import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';

@Module({
  imports: [
    JwtModule.register({
    secret: process.env.JWT_SECRET!,
    signOptions: { expiresIn: '1d' },
  }),
  ],
  providers: [GameService, GameGateway],
  controllers: [GameController],
})

export class GameModule {}
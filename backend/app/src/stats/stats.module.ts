import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

/*
  Modulo das estatisticas do dashboard. Nao precisa de importar o PrismaModule
  (e @Global) nem o AuthModule (a JwtStrategy regista-se sozinha no passport),
  por isso basta declarar o controller e o service.
*/
@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}

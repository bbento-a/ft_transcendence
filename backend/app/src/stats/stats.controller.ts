import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { StatsService, DateRange } from './stats.service';

/*
  Todas as rotas de stats exigem login (JWT), mas uma vez autenticado o utilizador
  pode ver as suas proprias stats OU as de outro jogador por username. As duas
  rotas delegam no mesmo StatsService.getStatsFor, so muda quem resolve o id.
*/
@UseGuards(AuthGuard('jwt'))
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  // Stats do proprio utilizador autenticado (id vem do token).
  @Get('me')
  getMyStats(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userId = (req.user as { id: string }).id;
    return this.stats.getStatsFor(userId, this.parseRange(from, to));
  }

  // Stats de outro jogador, procurado por username. 404 se nao existir.
  @Get('user/:username')
  async getUserStats(
    @Param('username') username: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userId = await this.stats.findUserIdByUsername(username);
    return this.stats.getStatsFor(userId, this.parseRange(from, to));
  }

  /*
    Converte os query params (strings) em datas. Valores em falta ou invalidos
    sao ignorados em vez de rebentar, para o dashboard poder mandar so um dos
    limites (ou nenhum) sem tratar de casos especiais.
  */
  private parseRange(from?: string, to?: string): DateRange {
    const parse = (value?: string): Date | undefined => {
      if (!value) return undefined;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };
    return { from: parse(from), to: parse(to) };
  }
}

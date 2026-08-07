import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
// Regras do username num sitio so, partilhadas com os DTO do auth
import { normalizeUsername } from '../auth/dto/userFields';

// Intervalo de datas opcional para filtrar as partidas. Ambos os limites sao
// opcionais: sem nenhum => historico todo.
export type DateRange = { from?: Date; to?: Date };

// Forma exata do que o dashboard recebe. Exportada para o controller e, mais
// tarde, para partilhar o tipo com o frontend se quisermos.
export type StatsResponse = {
  user: { id: string; username: string; avatarUrl: string | null };
  totals: { wins: number; losses: number; draws: number; total: number };
  matches: {
    opponent: string;
    opponentId: string | null;
    result: string;
    difficulty: string | null;
    createdAt: Date;
  }[];
};

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /*
    Resolve um username no seu id. Usado pelo endpoint por-username para nao
    duplicar a logica de stats: quem chama traduz nome -> id e depois usa o
    mesmo getStatsFor de sempre. Lanca 404 se o jogador nao existir.

    Quem escreve na caixa de pesquisa escreve como lhe apetece ("Bento", "BENTO"),
    mas o que esta gravado passou todo pelo normalizeUsername. Normalizar tambem
    a procura deixa a comparacao ser exata -- e uma comparacao exata usa o indice
    unico do username.
  */
  async findUserIdByUsername(username: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { username: normalizeUsername(username) },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user.id;
  }

  /*
    Ponto unico de verdade das stats. Serve tanto o "meu dashboard" (passa-se o
    id do proprio) como o "dashboard de outro" (passa-se o id resolvido do alvo).
    Os agregados sao derivados das partidas JA filtradas, para o pie/contadores
    respeitarem o intervalo de datas escolhido (e nao os contadores all-time do User).
  */
  async getStatsFor(userId: string, range: DateRange): Promise<StatsResponse> {
    // Confirma que o jogador existe e traz a identidade para o cabecalho do dashboard.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Filtro por data so entra no where quando ha pelo menos um limite.
    const where: Prisma.MatchWhereInput = { playerId: userId };
    if (range.from || range.to) {
      where.createdAt = {};
      if (range.from) where.createdAt.gte = range.from;
      if (range.to) where.createdAt.lte = range.to;
    }

    const matches = await this.prisma.match.findMany({
      where,
      orderBy: { createdAt: 'asc' }, // ordem cronologica para os graficos de linha
      select: {
        opponent: true,
        opponentId: true,
        result: true,
        difficulty: true,
        createdAt: true,
      },
    });

    // Conta W/L/D das partidas devolvidas (respeita o filtro de datas).
    const totals = { wins: 0, losses: 0, draws: 0 };
    for (const m of matches) {
      if (m.result === 'win') totals.wins++;
      else if (m.result === 'loss') totals.losses++;
      else if (m.result === 'draw') totals.draws++;
    }

    return {
      user,
      totals: { ...totals, total: matches.length },
      matches,
    };
  }
}

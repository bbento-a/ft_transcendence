import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';

// Prisma mockado: so precisamos de user.findUnique e match.findMany.
type PrismaMock = {
  user: { findUnique: jest.Mock };
  match: { findMany: jest.Mock };
};

describe('StatsService', () => {
  let service: StatsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      match: { findMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [StatsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<StatsService>(StatsService);
  });

  describe('findUserIdByUsername', () => {
    it('devolve o id quando o utilizador existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(service.findUserIdByUsername('bob')).resolves.toBe('u1');
    });

    it('lanca NotFound quando nao existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findUserIdByUsername('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getStatsFor', () => {
    const user = { id: 'u1', username: 'bob', avatarUrl: null };

    it('lanca NotFound quando o utilizador nao existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getStatsFor('nope', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deriva os totais das partidas devolvidas', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.match.findMany.mockResolvedValue([
        { opponent: 'a', opponentId: 'x', result: 'win', difficulty: null, createdAt: new Date() },
        { opponent: 'a', opponentId: 'x', result: 'loss', difficulty: null, createdAt: new Date() },
        { opponent: 'AI', opponentId: null, result: 'win', difficulty: 'hard', createdAt: new Date() },
      ]);
      const res = await service.getStatsFor('u1', {});
      expect(res.totals).toEqual({ wins: 2, losses: 1, draws: 0, total: 3 });
      expect(res.user.username).toBe('bob');
      expect(res.matches).toHaveLength(3);
    });

    it('aplica o intervalo de datas ao where da query', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.match.findMany.mockResolvedValue([]);
      const from = new Date('2026-01-01');
      const to = new Date('2026-02-01');
      await service.getStatsFor('u1', { from, to });
      const arg = prisma.match.findMany.mock.calls[0][0];
      expect(arg.where.playerId).toBe('u1');
      expect(arg.where.createdAt).toEqual({ gte: from, lte: to });
    });

    it('nao poe filtro de data quando nao ha intervalo', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.match.findMany.mockResolvedValue([]);
      await service.getStatsFor('u1', {});
      const arg = prisma.match.findMany.mock.calls[0][0];
      expect(arg.where.createdAt).toBeUndefined();
    });
  });
});

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  // o Logger do Nest em vez de console.log: sai com timestamp e contexto, na
  // mesma forma que o resto do arranque nos logs do container
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // 1. Grab your database connection string
    const connectionString = process.env.DATABASE_URL;

    // 2. Initialize the standard database driver pool
    const pool = new Pool({ connectionString });

    // 3. Wrap the pool in the Prisma Driver Adapter
    const adapter = new PrismaPg(pool);

    // 4. Pass the required options to the base PrismaClient class
    super({ adapter }); 
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected via Prisma with success');
  }
}
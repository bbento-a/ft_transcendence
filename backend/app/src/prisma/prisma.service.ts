import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
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
    console.log('Database connected via Prisma with success');
  }
}
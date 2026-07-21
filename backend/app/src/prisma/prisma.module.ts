import { Global,Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() //Prisma esta oficialmente disponivel em todo o projeto YUPI
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}

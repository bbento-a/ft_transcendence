import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { join } from "path";
import { NestExpressApplication } from "@nestjs/platform-express";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // atras do nginx: sem isto o req.ip seria sempre o IP do proprio nginx,
  // e o rate limit passava a ser partilhado por todos os utilizadores
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  

  

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.use(cookieParser());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

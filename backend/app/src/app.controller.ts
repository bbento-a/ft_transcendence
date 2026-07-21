import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';


/*

O controller e quem vai receber o trafego da rede

*/
@Controller() // pode ter um prefixo, ex: @Controller('users') para /users
export class AppController {
  //
  constructor(private readonly appService: AppService) {}

  @Get() //Responnde a pedidos HTTP Get na rota base ('/')
  getHello(): string {
    //Manda o trabalho para o Service
    return this.appService.getHello();
  }
}

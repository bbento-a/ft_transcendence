import { 
  WebSocketGateway, 
  SubscribeMessage, 
  ConnectedSocket, 
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { JwtService } from '@nestjs/jwt';
import * as cookie from 'cookie';
import { finished } from 'stream';

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  //Hardcode Waitlist para guardar os users que estao a espera de sala
  private Waitlist: Socket[] = [];

private spectators = new Set<string>();

  //Room Counter bom para manter track delas e dar lhes nomes
  private RoomCounter = 1;

  //
  constructor(
    private readonly gameService: GameService,
    private readonly jwtService: JwtService,
  ){}


  private async authenticateSocket(client: Socket): Promise<string | null>{
    const rawCookie = client.handshake.headers.cookie;
    if(!rawCookie)
        return null;

    const parsed = cookie.parse(rawCookie);
    const token = parsed['access_token'];
    if(!token)
        return null;

    try{
      const payload = await this.jwtService.verifyAsync(token,{
        secret: process.env.JWT_SECRET,
      });
      return payload.sub;//user id
    }catch{
      return null;
    }
  }

    async handleConnection(client: Socket) {
    const userId = await this.authenticateSocket(client);
    if (!userId) {
      client.emit('warning', 'Unauthorized');
      client.disconnect();
      return;
    }

    client.data.userId = userId;
    client.join(userId);

    // Reconnect: se este user tinha um jogo em pausa à espera dele
    const game = this.gameService.GetGameByPlayerId(userId);
    if (game && game.disconnectedPlayerId === userId) {
      this.gameService.CancelForfeitTimer(game.roomId);
      client.join(game.roomId);
      this.server.to(game.roomId).emit('opponentReconnected', `Player ${userId} reconnected.`);
      client.emit('gameStateUpdated', game);
    }
  }


  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if(!userId)
        return;//nao voltou a entrar

    console.log(`[Game] Player desconnected: ${userId}`);

    //Vai criar um novo array com todos os elementos exceto o que saio
    this.Waitlist = this.Waitlist.filter(socketInWaitlist => socketInWaitlist.data?.userId !== client.data?.userId);
    this.spectators.delete(userId);

    //Verificar se esta em um jogo ativo
    const game = this.gameService.GetGameByPlayerId(userId);
    if(!game || game.isGameOver)
        return;

      const opponentId = game.player1Id === userId ? game.player2Id : game.player1Id;
      game.disconnectedPlayerId = userId;

      this.server.to(opponentId).emit('opponentDisconnected', 'Your opponent left. Waiting for reconnect...');

      //Nao consegui voltar a tempo oh nao gg brother
      this.gameService.StartForfeitTimer(game.roomId,userId,async (finishedGame) => {
        this.server.to(finishedGame.roomId).emit('gameOver',{
          winner: finishedGame.winnerId,
          board: finishedGame.board,
          message: `Player ${userId} did not reconnect in time. Forfeit.`,
        });
        this.server.in(finishedGame.roomId).socketsLeave(finishedGame.roomId);
        await this.gameService.finalizeGame(finishedGame);
      });

  }

  @SubscribeMessage('LookforMatch')
  EnterWaitlist(@ConnectedSocket() client: Socket)
  {

    const userId = client.data.userId;

    if(this.gameService.GetGameByPlayerId(userId))
    {
      client.emit('warning', 'Already in an active game.');
      return;
    }

    /*
      Vamos verificar se e uma conexao ja existente
    */
    const IsAlreadyInWaitlist = this.Waitlist.some(socketInWaitlist => socketInWaitlist.data.userId == client.data.userId);
    if(IsAlreadyInWaitlist)
    {
      client.emit('warning','Already in the Waitlist...');
      return;
    }
    console.log(`Player ${userId} entered ih the waitlist.`);
    this.Waitlist.push(client);
    client.emit('statusWait','Looking for oponent...');

    if(this.Waitlist.length >= 2){
      //shift removes the first position 
      const player1 = this.Waitlist.shift();
      const player2 = this.Waitlist.shift();

      if(!player1 || !player2)
          return;
      
      //Creating the room
      const RoomName = `room-${this.RoomCounter}`;
      this.RoomCounter++;
      
      const InicialState = this.gameService.InitNewGame(RoomName,player1.data.userId,player2.data.userId);

      //Join the player to the room in socket.io
      player1.join(RoomName);
      player2.join(RoomName);

      this.server.to(RoomName).emit('MatchFound',{
        room: RoomName,
        message: 'Adversary found! Game will start',
        state: InicialState
      });
      console.log(`Match started in room ${RoomName} between ${player1.data.userId} and ${player2.data.userId}.`);
    }
  }

  @SubscribeMessage('playerMove')
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {roomId: string,column: number}
  ){

    const userId = client.data.userId;
    if (this.spectators.has(userId))
    {
      client.emit('warning','Spectators cannot play.');
      return;
    }
    if(data.column < 0 || data.column > 6)
    {
      client.emit('warning','Invalid column');
      return;
    }

    //Vamos fazer o nosso movimento
    const updatedState = this.gameService.MakeMove(data.roomId,userId,data.column);
    if(updatedState)
    {
      //Jodada foi valida vamos atualizar o tabuleiro para os dois besties
      this.server.to(data.roomId).emit('gameStateUpdated',updatedState);

      //Vamos ver se a jogada que foi feita acaba o jogo
      if(updatedState.isGameOver)
      {

        //Como WInnerId pode ser NULL caso o jogo termine em empatado
        const msg = updatedState.winnerId 
              ? `Player ${updatedState.winnerId} wins!` 
              : 'Game ended in a Draw!';

        this.server.to(data.roomId).emit('gameOver',{
          winner: updatedState.winnerId,
          board: updatedState.board,
          message: msg
        });

           this.server.in(data.roomId).socketsLeave(data.roomId);
            await this.gameService.finalizeGame(updatedState);
      }
    }else{
      client.emit('warning','Invalid Play or its nor your turn to play');
    }
  }

  @SubscribeMessage('joinSpectator')
  spectateGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string
  ){
    const game = this.gameService.GetStateOfGame(roomId);
    if(!game){
      client.emit('warning','match does not exists or its already over');
      return;
    }

    this.spectators.add(client.data.userId);
    client.join(roomId);
    console.log(`Spectator ${client.data.userId} started watching in this room: ${roomId}`);

    // O spectator vai recever o estado do board para conseguir ver as alteracoes
    client.emit('gameStateUpdated', game);
    client.emit('statusWait', `You are watching a game between ${game.player1Id} and ${game.player2Id}`);
  }
}

/*
GameGateway vai ficar sempre a esuta de mudanças por parte do player e vai rencaminhar a tarefa 

  Emit function Parametros
  1 - Nome do evento
  2 - O que vai enviar

*/

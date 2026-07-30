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
import { GameState } from './game.types';
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

  //Tempo minimo que a IA "pensa" antes de jogar para a jogada nao ser instantanea
  private static readonly AI_THINK_TIME_MS = 1000 * 1.3;

  //
  constructor(
    private readonly gameService: GameService,
    private readonly jwtService: JwtService,
  ){}


  private sleep(ms: number): Promise<void>{
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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

private async endGame(roomId: string, finalState: GameState, customMessage?: string) {
  const msg = customMessage ?? (finalState.winnerId
        ? `Player ${finalState.winnerId} wins!`
        : 'Game ended in a Draw!');

  this.server.to(roomId).emit('gameOver',{
    winner: finalState.winnerId,
    board: finalState.board,
    message: msg
  });

  this.server.in(roomId).socketsLeave(roomId);
  await this.gameService.finalizeGame(finalState);
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
      game.disconnectedPlayerId = null;
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
      await this.endGame(finishedGame.roomId, finishedGame, `Player ${userId} did not reconnect in time. Forfeit.`);
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

    if(updatedState.isGameOver)
    {
      await this.endGame(data.roomId, updatedState);
    }
    else if(updatedState.player2Id === 'AI' && updatedState.currentPlayer === 2)
    {
      //Jogo continua e agora e a vez da IA jogar
      //Espera antes de jogar para dar tempo ao jogador de respirar (enquanto isto corre a vez ainda e da IA, logo o jogador nao consegue jogar)
      await this.sleep(GameGateway.AI_THINK_TIME_MS);

      const afterAIMove = this.gameService.PlayerAIMove(data.roomId);

      if(afterAIMove)
      {
        this.server.to(data.roomId).emit('gameStateUpdated',afterAIMove);

        if(afterAIMove.isGameOver)
        {
          await this.endGame(data.roomId, afterAIMove);
        }
      }
    }
  }else{
    client.emit('warning','Invalid Play or its nor your turn to play');
  }
}

  @SubscribeMessage('playVsAI')
  StartAIGame(@ConnectedSocket() client: Socket)
  {
    const userId = client.data.userId;

    if(this.gameService.GetGameByPlayerId(userId))
    {
      client.emit('warning', 'Already in an active game.');  
      return;
    }

  const RoomName = `room-${this.RoomCounter}`;
  this.RoomCounter++;

  const initialState = this.gameService.InitNewGame(RoomName,userId,'AI');
  client.join(RoomName);

  client.emit('MatchFound', {
      room: RoomName,
      message: 'Playing against AI',
      state: initialState,
    });
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


  
  

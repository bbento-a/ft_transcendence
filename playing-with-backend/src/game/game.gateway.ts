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
  constructor(private readonly gameService: GameService){}

  handleDisconnect(client: Socket) {
    console.log(`[Game] Player desconnected: ${client.id}`);

    //Vai criar um novo array com todos os elementos exceto o que saio
    this.Waitlist = this.Waitlist.filter(socketInWaitlist => socketInWaitlist.id !== client.id);
    this.spectators.delete(client.id);
    //Verificar se esta em um jogo ativo
    const game = this.gameService.GetGameByPlayerId(client.id);
    if(game)
    {
      const opponentId = game.player1Id === client.id ? game.player2Id : game.player1Id;
      this.server.to(opponentId).emit('opponentDisconnected', 'Your opponent left the game.');

      //Limpa a sala do socket.io
      this.server.in(game.roomId).socketsLeave(game.roomId);
      this.gameService.endGame(game.roomId);
    }
  }

  @SubscribeMessage('LookforMatch')
  EnterWaitlist(@ConnectedSocket() client: Socket)
  {

    if(this.gameService.GetGameByPlayerId(client.id))
    {
      client.emit('warning', 'Already in an active game.');
      return;
    }

    /*
      Vamos verificar se e uma conexao ja existente
    */
    const IsAlreadyInWaitlist = this.Waitlist.some(socketInWaitlist => socketInWaitlist.id == client.id);
    if(IsAlreadyInWaitlist)
    {
      client.emit('warning','Already in the Waitlist...');
      return;
    }
    console.log(`Player ${client.id} entered ih the waitlist.`);
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
      
      const InicialState = this.gameService.InitNewGame(RoomName,player1.id,player2.id);

      //Join the player to the room in socket.io
      player1?.join(RoomName);
      player2?.join(RoomName);

      this.server.to(RoomName).emit('MatchFound',{
        room: RoomName,
        message: 'Adversary found! Game will start',
        state: InicialState
      });
      console.log(`Match started in room ${RoomName} between ${player1.id} and ${player2.id}.`);
    }
  }

  @SubscribeMessage('playerMove')
  handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {roomId: string,column: number}
  ){

    if (this.spectators.has(client.id))
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
    const updatedState = this.gameService.MakeMove(data.roomId,client.id,data.column);
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

        this.gameService.endGame(data.roomId);
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

    this.spectators.add(client.id);
    client.join(roomId);
    console.log(`Spectator ${client.id} started watching in this room: ${roomId}`);

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

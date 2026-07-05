import { Injectable } from '@nestjs/common';
import { GameState } from './game.types';
import { PrismaService } from '../prisma/prisma.service';
import { reportUnhandledError } from 'rxjs/internal/util/reportUnhandledError';
import { count } from 'console';

const FORFEIT_GRACE_PERIOD_MS = 30_000; //30s para reconectar

@Injectable()
export class GameService
{
  //Mapa que contem os jogos ativos Key: Sala, Value: Estado do jogo
  private activeGames = new Map<string,GameState>();
  private forfeitTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly prisma: PrismaService) {}

  // Função auxiliar para gerar matrizes 6x7 cheias de zeros
  private createEmptyBoard(): number[][] {
    // Cria 6 linhas, cada uma com um array de 7 colunas a zero
    return Array.from({ length: 6 }, () => Array(7).fill(0));
  }

  InitNewGame(roomId: string ,player1Id: string ,player2Id: string): GameState {
    const newGame: GameState = {
      board: this.createEmptyBoard(),
      roomId: roomId,
      player1Id: player1Id,
      player2Id: player2Id,
      currentPlayer: 1, // player 1 vai começar sempre 
      isGameOver:  false,
      winnerId: null,
    };

    this.activeGames.set(roomId,newGame);
    return newGame;
  }

GetGameByPlayerId(playerId: string): GameState | undefined {
  for (const state of this.activeGames.values()) {
    if (state.player1Id === playerId || state.player2Id === playerId) {
      return state;
    }
  }
  return undefined;
}
  //Returna o o estado
  GetStateOfGame(roomId: string): GameState | undefined
  {
    return this.activeGames.get(roomId);
  }


//Processa uma jodada a ideia e returnar o estado atualizado ou undefined se for invalido :)
MakeMove(roomId: string,playerId: string,column: number): GameState | undefined
{
  //Pega o jogo atual
  const game = this.activeGames.get(roomId);

  //Jogo nao existe ou acabou
  if(!game || game.isGameOver)
    return undefined;

  //Descobrir quem e que enviou a mensagem
  const isPlayer1 = game.player1Id == playerId;
  const isPlayer2 = game.player2Id == playerId;

  //Vamos ver de quem e a vez
  if((isPlayer1 && game.currentPlayer !== 1) || (isPlayer2 && game.currentPlayer !== 2))
    return undefined; // nao e a vez dele, vamos ignorar a jogada

  /* GRAVIDADE DA WISH (Vamos encontrar a linha mais baixa disponivel na coluna selecionada)
  O tamanho do tabuleiro e de 6 linhas (0 a 5). Vamos começar a olhar de baixo(5) para cima(0)
  */
  let rowToPlace = -1;
  for(let row = 5; row >= 0; row--)
  {
    if(game.board[row][column] === 0)
    {
      rowToPlace = row;
      break;
    }
  }

  //Coluna esta cheia, nao consegues meter nenhuma 
  if(rowToPlace === -1)
      return undefined;
  
  //Atualizar o board com a ficha(1 para Player1, 2 para Player2)
  game.board[rowToPlace][column] = game.currentPlayer;

  //Sera que ganhou???
  const hasWon = this.checkWin(game.board,rowToPlace,column,game.currentPlayer);
  if(hasWon)
  {
    game.isGameOver = true;
    game.winnerId = playerId;
  }else if(this.checkDraw(game.board))
  {
    game.isGameOver = true;
    game.winnerId = null;
  }else{
    //Troca o turno na brotheragem
    game.currentPlayer = game.currentPlayer === 1 ? 2 : 1;
  }
  return game;
}

//Se a linha estiver toda preenchida nao ha mais jogadas 
private checkDraw(board: number[][]): boolean
{
  return board[0].every(cell => cell !== 0);
}

  private checkWin(board: number[][],row: number,col: number,player: number): boolean
  {
    const directions = [
      [[0,1] , [0, -1]], // Eixo horizontal (Direita, Esquerda)
      [[1,0] , [-1, 0]], // Eixo Vertical (baixo,Cima)
      [[1,1] , [-1, -1]], // Eixo Diagonal Principal (\)
      [[1,-1] , [-1, 1]], // Eixo Diagonal Secundario (/)
    ];
    //Vamos verificar cada um dos eixos
    for(const axis of directions)
    {
      let count = 1; // Ficha que acabou de cair conta como 1
      
      //
      for(const dir of axis)
      {
        let r = row + dir[0];
        let c = col + dir[1];

        //Enquanto estiver mos dentro da playzone(grid) e a ficha for do mesmo player
        while(r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] == player)
        {
          count++;
          r += dir[0]; // da mais um passo na mesma direçao
          c += dir[1];
        }
      }

      if(count >= 4)
          return true;
    }
    return false;
  }
  


StartForfeitTimer(roomId: string,disconnectedPlayerId: string, onForfeit: (game: GameState) => void)
{
  //Se ja tiver um timer para esta saula, nao duplica
  this.CancelForfeitTimer(roomId);

  const timer = setTimeout(() =>{
    const game = this.activeGames.get(roomId);
    if(!game || game.isGameOver)
        return;
  
  const winnerId = game.player1Id === disconnectedPlayerId ? game.player2Id : game.player1Id;
  game.isGameOver = true;
  game.winnerId = winnerId;

  this.activeGames.delete(roomId);
  this.forfeitTimers.delete(roomId);
  onForfeit(game);
  },FORFEIT_GRACE_PERIOD_MS);
  this.forfeitTimers.set(roomId,timer);
}

  CancelForfeitTimer(roomId: string) {
    const timer = this.forfeitTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.forfeitTimers.delete(roomId);
    }
  }

async finalizeGame(game: GameState): Promise<void> {
    this.CancelForfeitTimer(game.roomId);
    this.activeGames.delete(game.roomId);

    if (game.winnerId === null) {
      // empate: ambos ganham um draw
      await this.prisma.user.updateMany({
        where: { id: { in: [game.player1Id, game.player2Id] } },
        data: { draws: { increment: 1 } },
      });
      return;
    }

    const loserId = game.winnerId === game.player1Id ? game.player2Id : game.player1Id;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: game.winnerId },
        data: { wins: { increment: 1 } },
      }),
      this.prisma.user.update({
        where: { id: loserId },
        data: { losses: { increment: 1 } },
      }),
    ]);
  }
}

/*
Em ves de verificar o board todo podemos so verificar quando uma ficha cair verificar para os 4 lados possivels
Horizontal (Esquerda + Direita)
Vertical (Apenas para baixo pois nao ha fichas por cima da que acabou de cair)
Diaginal Principal(Cima-Esquerda + baixo-Direita)
Diaginal Secundarop(Baixo-Esquerda + Cima-Direita)
*/





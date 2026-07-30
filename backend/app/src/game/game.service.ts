import { Injectable } from '@nestjs/common';
import { GamePlayer, GameState } from './game.types';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectFourAI } from './game.ai';

const FORFEIT_GRACE_PERIOD_MS = 30_000; //30s para reconectar
const AI_PLAYER_ID = 'AI';

@Injectable()
export class GameService
{
  //Mapa que contem os jogos ativos Key: Sala, Value: Estado do jogo
  private activeGames = new Map<string,GameState>();
  private forfeitTimers = new Map<string, NodeJS.Timeout>();
  private readonly ai = new ConnectFourAI(); //instancia 

  constructor(private readonly prisma: PrismaService) {}

  // Função auxiliar para gerar matrizes 6x7 cheias de zeros
  private createEmptyBoard(): number[][] {
    // Cria 6 linhas, cada uma com um array de 7 colunas a zero
    return Array.from({ length: 6 }, () => Array(7).fill(0));
  }

  InitNewGame(roomId: string, player1: GamePlayer, player2: GamePlayer): GameState {
    const newGame: GameState = {
      board: this.createEmptyBoard(),
      roomId: roomId,
      player1Id: player1.id,
      player1Name: player1.name,
      player2Id: player2.id,
      player2Name: player2.name,
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

  //Quem enviou nem sequer faz parte deste jogo, ignorar
  if(!isPlayer1 && !isPlayer2)
    return undefined;

  //Vamos ver de quem e a vez
  if((isPlayer1 && game.currentPlayer !== 1) || (isPlayer2 && game.currentPlayer !== 2))
    return undefined; // nao e a vez dele, vamos ignorar a jogada

  //Coluna invalida
  if(!Number.isInteger(column) || column < 0 || column > 6)
    return undefined;

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

PlayerAIMove(roomId: string): GameState | undefined
{
  const game = this.activeGames.get(roomId);

  if(!game || game.isGameOver)
    return undefined;

  if(game.player2Id != AI_PLAYER_ID || game.currentPlayer !== 2)
    return undefined;
  const column = this.ai.getBestMove(game.board,2,6);
  return this.MakeMove(roomId,AI_PLAYER_ID,column);
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

  // Drop a game without recording a result. Somebody walked out, so there is no
  // winner and no loser: unlike finalizeGame, nothing is written to the database.
  AbandonGame(roomId: string) {
    this.CancelForfeitTimer(roomId);
    this.activeGames.delete(roomId);
  }

async finalizeGame(game: GameState): Promise<void> {
    this.CancelForfeitTimer(game.roomId);
    this.activeGames.delete(game.roomId);

    try {
      if (game.winnerId === null) {
        // empate: ambos ganham um draw, exceto a IA :( ja nem ia se pode ser
        const realPlayerIds = [game.player1Id, game.player2Id].filter(id => id !== AI_PLAYER_ID);
        if (realPlayerIds.length > 0) {
          await this.prisma.user.updateMany({
            where: { id: { in: realPlayerIds } },
            data: { draws: { increment: 1 } },
          });
        }
        return;
      }

      const loserId = game.winnerId === game.player1Id ? game.player2Id : game.player1Id;

      const updates: any[] = [];
      if (game.winnerId !== AI_PLAYER_ID) {
        updates.push(
          this.prisma.user.update({
            where: { id: game.winnerId },
            data: { wins: { increment: 1 } },
          }),
        );
      }
      if (loserId !== AI_PLAYER_ID) {
        updates.push(
          this.prisma.user.update({
            where: { id: loserId },
            data: { losses: { increment: 1 } },
          }),
        );
      }

      if (updates.length > 0) {
        await this.prisma.$transaction(updates);
      }
    } catch (error) {
      console.error(`[Game] Failed to persist result for room ${game.roomId}:`, error);
    }
  }
}




import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiConfig, Difficulty, GamePlayer, GameState } from './game.types';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectFourAI } from './game.ai';

// Exported so the gateway can tell the players how long the grace period is,
// instead of keeping a second copy of the number that could drift out of sync.
export const FORFEIT_GRACE_PERIOD_MS = 30_000; //30s para reconectar
const AI_PLAYER_ID = 'AI';

/*
    >>> MUDA AQUI PARA TESTAR OS NIVEIS <<<
    Enquanto o frontend nao tiver ecra de escolha, e este valor que manda em todos
    os jogos contra a IA. Aceita 'easy', 'medium' ou 'hard'.
*/
const DEFAULT_AI_DIFFICULTY: Difficulty = 'hard';

/*
    O que cada nivel quer dizer na pratica.

    depth          = jogadas a frente que a IA olha.
    blunderChance  = probabilidade de jogar a 2a melhor jogada em vez da melhor.
    timeBudgetMs   = se definido, a IA aprofunda ate gastar este tempo em vez de ir
                     sempre ate ao depth. Ver o comentario no searchIterative.

    Os tempos sao por jogada e sao tempo em que o servidor fica bloqueado (a procura
    e sincrona), por isso convem nao esticar.

      easy   -> ve 2 jogadas a frente e erra 40% das vezes. Falha bloqueios obvios,
                que e o que faz parecer um adversario distraido e nao um bot partido.
      medium -> ve 6 jogadas a frente e erra 10% das vezes. Joga bem mas escorrega.
      hard   -> aprofunda o que conseguir em 150ms (chega a 10-12 jogadas em posicoes
                calmas) e nunca erra de proposito.

    Porque e que o hard nao e simplesmente depth 10 fixo: medimos 60 posicoes e o pior
    caso de depth 10 foi 2.7s e o de depth 9 foi 2.4s. Com orcamento de tempo o pior
    caso passa a ser o proprio orcamento.
*/
const AI_LEVELS: Record<Difficulty, AiConfig> = {
  easy:   { depth: 2,  blunderChance: 0.40 },
  medium: { depth: 6,  blunderChance: 0.10 },
  hard:   { depth: 12, blunderChance: 0, timeBudgetMs: 150 },
};

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

  /*
    difficulty so faz sentido quando o player2 e a IA. Fica no fim e opcional para
    as chamadas de jogo entre dois humanos continuarem iguais.
  */
  InitNewGame(roomId: string, player1: GamePlayer, player2: GamePlayer, difficulty?: Difficulty): GameState {
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
      difficulty: player2.id === AI_PLAYER_ID ? (difficulty ?? DEFAULT_AI_DIFFICULTY) : undefined,
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

  //Jogos criados antes deste campo existir ficam no nivel por omissao
  const config = AI_LEVELS[game.difficulty ?? DEFAULT_AI_DIFFICULTY];
  const column = this.ai.getMove(game.board,2,config);

  //-1 significa que a IA nao tinha onde jogar. Nao devia acontecer (o empate e detetado antes)
  if(column < 0)
    return undefined;

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

  /*
    Fecha um jogo A DECORRER porque um jogador saiu de proposito: quem saiu
    perde, quem ficou ganha — e o que o popup de saida promete. So marca o
    resultado; gravar (contadores + historico) e trabalho do finalizeGame,
    que quem chamar isto deve invocar a seguir com o estado devolvido.

    Devolve undefined se nao houver nada para perder: jogo inexistente, ja
    terminado, o "leaver" nem sequer e jogador dele, ou ainda ninguem jogou
    uma peca. Quem chama trata esses casos como uma saida simples (Abandon),
    sem resultado nenhum gravado.
  */
  ForfeitGame(roomId: string, leaverId: string): GameState | undefined {
    const game = this.activeGames.get(roomId);
    if (!game || game.isGameOver)
      return undefined;
    if (game.player1Id !== leaverId && game.player2Id !== leaverId)
      return undefined;
    // Tabuleiro intacto: nao chegou a haver jogo, por isso nao ha vitoria nem
    // derrota a atribuir. Sair de uma sala onde ninguem jogou e so sair.
    if (!this.hasAnyPiece(game.board))
      return undefined;

    game.isGameOver = true;
    game.winnerId = game.player1Id === leaverId ? game.player2Id : game.player1Id;
    return game;
  }

  //Ja caiu alguma peca no tabuleiro?
  private hasAnyPiece(board: number[][]): boolean {
    return board.some((row) => row.some((cell) => cell !== 0));
  }

async finalizeGame(game: GameState): Promise<void> {
    this.CancelForfeitTimer(game.roomId);
    this.activeGames.delete(game.roomId);

    try {
      // Descobrir o resultado de cada jogador humano. A IA nunca entra na lista,
      // por isso nao ganha contadores nem historico.
      const outcomes = this.buildOutcomes(game);
      if (outcomes.length === 0) return; // nada a gravar (ex.: so a IA sobrou)

      // Uma unica transacao por jogador: incrementa o contador agregado E cria a
      // linha de historico. Ou grava os dois ou nenhum, para os totais nunca
      // ficarem dessincronizados do historico detalhado.
      const ops = outcomes.flatMap((o) => [
        this.prisma.user.update({
          where: { id: o.playerId },
          data: this.counterIncrement(o.result),
        }),
        this.prisma.match.create({
          data: {
            playerId: o.playerId,
            opponent: o.opponent,
            opponentId: o.opponentId,
            result: o.result,
            difficulty: o.difficulty,
          },
        }),
      ]);

      await this.prisma.$transaction(ops);
    } catch (error) {
      console.error(`[Game] Failed to persist result for room ${game.roomId}:`, error);
    }
  }

  /*
    Traduz o estado final do jogo numa lista de resultados, um por jogador humano.
    Cada resultado sabe: de quem e, contra quem foi, o resultado ("win"/"loss"/
    "draw") e qual o contador a incrementar no User. A IA e removida no fim.
  */
  private buildOutcomes(game: GameState): PlayerOutcome[] {
    const p1 = { id: game.player1Id, name: game.player1Name };
    const p2 = { id: game.player2Id, name: game.player2Name };

    // Sem vencedor => empate para ambos. Caso contrario, quem tem o winnerId ganha.
    let pairings: Array<{ player: typeof p1; opponent: typeof p1; result: MatchResult }>;
    if (game.winnerId === null) {
      pairings = [
        { player: p1, opponent: p2, result: 'draw' },
        { player: p2, opponent: p1, result: 'draw' },
      ];
    } else {
      const winnerIsP1 = game.winnerId === p1.id;
      const winner = winnerIsP1 ? p1 : p2;
      const loser = winnerIsP1 ? p2 : p1;
      pairings = [
        { player: winner, opponent: loser, result: 'win' },
        { player: loser, opponent: winner, result: 'loss' },
      ];
    }

    return pairings
      .filter((p) => p.player.id !== AI_PLAYER_ID)
      .map((p) => {
        const vsAI = p.opponent.id === AI_PLAYER_ID;
        return {
          playerId: p.player.id,
          opponent: p.opponent.name,
          // Id estavel do adversario; null se for a IA
          opponentId: vsAI ? null : p.opponent.id,
          result: p.result,
          // So os jogos contra a IA tem dificuldade; usa o default se nao vier.
          difficulty: vsAI ? game.difficulty ?? DEFAULT_AI_DIFFICULTY : null,
        };
      });
  }

  /*
    Traduz o resultado no contador certo do User. Feito com switch (em vez de
    concatenar "s") porque "loss" -> "losses", e assim fica tudo tipado pelo
    Prisma sem casts.
  */
  private counterIncrement(result: MatchResult): Prisma.UserUpdateInput {
    switch (result) {
      case 'win':
        return { wins: { increment: 1 } };
      case 'loss':
        return { losses: { increment: 1 } };
      case 'draw':
        return { draws: { increment: 1 } };
    }
  }
}

// Resultado de UM jogador numa partida, pronto a persistir.
type MatchResult = 'win' | 'loss' | 'draw';
type PlayerOutcome = {
  playerId: string;
  opponent: string;
  opponentId: string | null;
  result: MatchResult;
  difficulty: string | null; // "easy"|"medium"|"hard" (so vs IA), senao null
};




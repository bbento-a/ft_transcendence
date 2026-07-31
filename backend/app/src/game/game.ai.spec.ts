import { ConnectFourAI } from './game.ai';

// Helper: cria um board vazio 6x7
function emptyBoard(): number[][] {
  return Array.from({ length: 6 }, () => Array(7).fill(0));
}

describe('ConnectFourAI', () => {
  let ai: ConnectFourAI;

  beforeEach(() => {
    ai = new ConnectFourAI();
  });

  it('numa board vazia, deve preferir a coluna central', () => {
    const board = emptyBoard();
    const move = ai.getBestMove(board, 1, 1); // depth=1 chega, e mantem o teste rapido

    expect(move).toBe(3); // coluna central (0-indexed, 7 colunas: 0..6)
  });

  it('deve bloquear o adversario quando ele tem 3 em linha com uma ponta aberta', () => {
    const board = emptyBoard();
    // Player 2 (adversario) tem 3 fichas seguidas na linha de baixo, colunas 0,1,2
    // Coluna 3 esta livre -> se a IA (player 1) nao jogar ali, o adversario ganha a seguir
    board[5][0] = 2;
    board[5][1] = 2;
    board[5][2] = 2;

    const move = ai.getBestMove(board, 1, 2); // depth=2: precisa de ver a resposta do adversario

    expect(move).toBe(3);
  });

  it('deve fechar a propria vitoria quando tem 3 em linha e pode completar', () => {
    const board = emptyBoard();
    // A propria IA (player 1) tem 3 fichas seguidas, coluna 3 completa o 4 em linha
    board[5][0] = 1;
    board[5][1] = 1;
    board[5][2] = 1;

    const move = ai.getBestMove(board, 1, 1); // depth=1 chega: a vitoria e detetada assim que terminal

    expect(move).toBe(3);
  });

  it('nao deve escolher uma coluna cheia', () => {
    const board = emptyBoard();
    // Enche a coluna 3 toda
    for (let r = 0; r < 6; r++) {
      board[r][3] = (r % 2) + 1;
    }

    const move = ai.getBestMove(board, 1, 3);

    expect(move).not.toBe(3);
  });

  it('remata ja em vez de arrastar uma vitoria que ja e certa', () => {
    const board = emptyBoard();
    // IA (2) com 3 seguidas e as DUAS pontas livres (colunas 1 e 5): ganha ja
    // jogando em 1 ou em 5, e o adversario so consegue tapar uma das pontas.
    board[5][2] = 2;
    board[5][3] = 2;
    board[5][4] = 2;

    const move = ai.getBestMove(board, 2, 6);

    // Empilhar na coluna 3 tambem levava a vitoria, so que uma jogada mais tarde.
    // Como a vitoria vale WIN_SCORE + depth, ganhar agora vale mais do que ganhar
    // depois e a IA tem de fechar o jogo. Sem o "+ depth" as duas valiam o mesmo.
    expect([1, 5]).toContain(move);
  });

  it('avalia um board cheio sem vencedor como empate e nao tem jogada', () => {
    // Padrao que enche as 42 casas sem ninguem fazer 4 em linha
    const pattern = [
      [1, 2, 1, 2, 1, 2, 1],
      [1, 2, 1, 2, 1, 2, 1],
      [2, 1, 2, 1, 2, 1, 2],
      [2, 1, 2, 1, 2, 1, 2],
      [1, 2, 1, 2, 1, 2, 1],
      [1, 2, 1, 2, 1, 2, 1],
    ];

    // -1 = nao ha coluna nenhuma para jogar
    expect(ai.getBestMove(pattern, 2, 4)).toBe(-1);
  });

  describe('niveis de dificuldade', () => {
    // Adversario (1) com 3 seguidas em baixo: quem joga a seguir TEM de tapar a coluna 3
    function threatBoard(): number[][] {
      const board = emptyBoard();
      board[5][0] = 1;
      board[5][1] = 1;
      board[5][2] = 1;
      return board;
    }

    afterEach(() => jest.restoreAllMocks());

    it('hard nunca falha um bloqueio obvio', () => {
      const hard = { depth: 12, blunderChance: 0, timeBudgetMs: 150 };
      // Sem blunderChance nao ha aleatoriedade nenhuma na escolha, por isso repetir e barato
      for (let i = 0; i < 5; i++) {
        expect(ai.getMove(threatBoard(), 2, hard)).toBe(3);
      }
    });

    it('easy bloqueia quando nao se engana...', () => {
      // 0.9 > blunderChance -> desta vez joga a melhor jogada
      jest.spyOn(Math, 'random').mockReturnValue(0.9);

      expect(ai.getMove(threatBoard(), 2, { depth: 2, blunderChance: 0.4 })).toBe(3);
    });

    it('...mas engana-se de vez em quando', () => {
      // 0.1 < blunderChance -> desta vez joga de proposito a 2a melhor e deixa passar o 4 em linha
      jest.spyOn(Math, 'random').mockReturnValue(0.1);

      expect(ai.getMove(threatBoard(), 2, { depth: 2, blunderChance: 0.4 })).not.toBe(3);
    });
  });

  it('o nivel hard respeita o orcamento de tempo', () => {
    // A procura e sincrona: este tempo e tempo com o servidor inteiro bloqueado.
    // Posicao de meio de jogo, que e onde as procuras de profundidade fixa disparavam.
    const board = emptyBoard();
    board[5][3] = 1; board[5][2] = 2; board[4][3] = 2;
    board[5][4] = 1; board[4][2] = 1; board[3][3] = 2;

    const start = Date.now();
    ai.getMove(board, 2, { depth: 12, blunderChance: 0, timeBudgetMs: 150 });
    const elapsed = Date.now() - start;

    // Margem larga: o corte so e verificado de 1024 em 1024 nos, por isso passa sempre um pouco
    expect(elapsed).toBeLessThan(400);
  });
});
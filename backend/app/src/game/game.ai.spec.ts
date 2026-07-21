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
});
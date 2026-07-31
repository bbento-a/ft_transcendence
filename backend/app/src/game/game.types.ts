//Niveis de dificuldade da IA. Sao estes os valores aceites pelo gateway.
export type Difficulty = 'easy' | 'medium' | 'hard';

//Lista das dificuldades validas, para conseguirmos validar o que vem do cliente
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/*
    Como e que cada nivel se traduz em comportamento da IA.
    O mapa de Difficulty -> AiConfig vive no game.service.ts (AI_LEVELS)
*/
export interface AiConfig
{
    //Quantas jogadas a frente e que a IA olha. Mais profundidade = mais forte e mais lento
    depth: number;
    //Probabilidade (0 a 1) de jogar a 2a melhor jogada em vez da melhor.
    //E isto que faz um nivel facil parecer distraido em vez de simplesmente burro
    blunderChance: number;
    /*
        Opcional. Se estiver definido, a IA procura por aprofundamento sucessivo
        (depth 1, depth 2, ...) e para quando gastar este tempo, ficando com o
        resultado da ultima profundidade que conseguiu acabar.

        Serve para poder pedir profundidades altas sem arriscar bloquear o servidor:
        o tempo de uma procura de profundidade fixa varia imenso com a posicao
        (depth 9 medimos entre 1ms e 2.4s), enquanto isto tem sempre um teto.
    */
    timeBudgetMs?: number;
}

export interface GameState
{
    roomId: string;
    board: number[][];
    player1Id: string;
    player2Id: string;
    currentPlayer: number;//What turn is Player1 or Player2
    isGameOver: boolean;
    winnerId: string | null;
    disconnectedPlayerId?: string | null;
    //So existe em jogos contra a IA. Se vier undefined usa se o DEFAULT_AI_DIFFICULTY
    difficulty?: Difficulty;
}
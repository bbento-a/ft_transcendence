export interface GameState
{
    roomId: string;
    board: number[][];
    player1Id: string;
    player2Id: string;
    currentPlayer: number;//What turn is Player1 or Player2
    isGameOver: boolean;
    winnerId: string | null;
}
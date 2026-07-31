// Who is sitting at one side of the board. The name travels with the game state
// so the page can label the players without looking anyone up.
export interface GamePlayer
{
    id: string;
    name: string;
}

export interface GameState
{
    roomId: string;
    board: number[][];
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    currentPlayer: number;//What turn is Player1 or Player2
    isGameOver: boolean;
    winnerId: string | null;
    disconnectedPlayerId?: string | null;
}

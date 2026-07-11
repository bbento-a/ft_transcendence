
const ROWS = 6;
const COLS = 7;
const WIN_SCORE = 1_000_000;

export class ConnectFourAI
{
    /*
        IA  vai tentar minimizar o resultado
    */

   /**
    * Devolve a melhor coluna para a IA jogar
    * @param board estado atual do tabuleiro
    * @param aiPlayer Numero que representa a IA
    * @param depth Profundidade maxima de procura (5 - 7) a partir deste range ele fica lento :(
    * 
   */
    public getBestMove(board: number[][],aiPlayer: number,depth = 6): number
    {
        const opponent = aiPlayer === 1 ? 2 : 1;
        const [bestCol] = this.minimax(board,depth,-Infinity,Infinity,true,aiPlayer,opponent);
        return bestCol;
    }

    private minimax(
        board: number[][], // board
        depth: number, // profundidade de procura
        alpha: number,
        beta: number,
        maximizing: boolean, // se for true e a vez do player 
        aiPlayer: number,
        opponent: number,
    ): [number,number]{
        const validCols = this.getValidColumns(board);
        const terminal = this.isTerminalNode(board,validCols);

        if(depth == 0 || terminal)
        {
            if(terminal)
            {
                //Vou descobrir se alguem ganhou
                
            }
        }
    }

    //Verifica se Player conquistou o famoso 4 em linha em qualquer sitio do board

    private boardHasWinner(board: number[][],player: number): boolean
    {
        //Horizontal
        for(let r = 0;r < ROWS; r++)
        {
            for(let c = 0; c <= COLS - 4;c++)
            {
                if(board[r][c] === player && board[r][c + 1] === player && board[r][c + 2] === player && board[r][c + 3] === player)
                    return true;
            }
        }

        //Vertical
        for(let c = 0;c < COLS; c++)
        {
            for(let r = 0; r <= ROWS - 4; r++)
            {
                if(board[r][c] === player && board[r + 1][c] === player && board[r + 2][c] === player && board[r + 3][c] === player)
                    return true;
            }
        }

        //Diagonal \
        for(let r = 0; r <= ROWS - 4;r++)
        {
            for(let c = 0; c <= COLS - 4;c++)
            {
                if(board[r][c] === player && board[r + 1][c + 1] === player &&  board[r + 2][c + 2] === player &&  board[r + 3][c + 3] === player)
                    return true;
            }
        }

        // / 
        for(let r = 3; r <= ROWS;r++)
        {
            for(let c = 0; c <= COLS - 4;c++)
            {
                if(board[r][c] === player && board[r - 1][c - 1] === player &&  board[r - 2][c - 2] === player &&  board[r - 3][c - 3] === player)
                    return true;
            }
        }
        return false;
    }

}
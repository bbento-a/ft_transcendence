
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
                if(this.boardHasWinner(board,aiPlayer))
                    return ([-1,WIN_SCORE]);
                if(this.boardHasWinner(board,opponent))
                    return ([-1,-WIN_SCORE]);
            }
            //Depth esgotada mas o jogo continua
            return [-1,this.evaluateBoard(board,aiPlayer,opponent)];
        }
        if(maximizing)
        {
            let value = -Infinity;
            let bestCol = validCols[Math.floor(Math.random() * validCols.length)];//Em caso de empates ele assim nao fica preso a jogar na mesma couna
            for(const col of validCols)
            {
                const {board: newBoard} = this.dropPiece(board,col,aiPlayer);
                const [,score] = this.minimax(newBoard,depth -1,alpha,beta,false,aiPlayer,opponent);
                if(score > value)
                {
                    value = score;
                    bestCol = col;
                }
                alpha = Math.max(alpha,value);
                //min tem melhor valor nao quero ver este ramo
                if(alpha >= beta)
                    break;
            }
            return [bestCol,value];  
        }
        else
        {
            let value = Infinity;
            let bestCol = validCols[Math.floor(Math.random() * validCols.length)];//Em caso de empates ele assim nao fica preso a jogar na mesma couna
            for(const col of validCols)
            {
                const {board: newBoard} = this.dropPiece(board,col,opponent);
                const [,score] = this.minimax(newBoard,depth -1,alpha,beta,true,aiPlayer,opponent);
                if(score < value)
                {
                    value = score;
                    bestCol = col;
                }
                beta = Math.min(beta,value);
                //min tem melhor valor nao quero ver este ramo
                if(alpha >= beta)
                    break;
            }
            return [bestCol,value];
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
        for(let r = 3; r < ROWS; r++)
        {
            for(let c = 0; c <= COLS - 4; c++)
            {
                if(board[r][c] === player && board[r - 1][c + 1] === player &&  board[r - 2][c + 2] === player &&  board[r - 3][c + 3] === player)
                    return true;
            }
        }
        return false;
    }

    //Verifica se pode verificar se pode jogar nessa coluna 
    private getValidColumns(board: number[][]): number[]
    {
        const cols: number[] = [];
        for(let c = 0; c < COLS;c++)
        {
            if(board[0][c] === 0)
                cols.push(c);   
        }
        return cols;
    }

    private dropPiece(board: number[][], col: number, player: number): { board: number[][]; row: number } 
    {

        /*
        Tenho de copiar o board porque cada ramo do algoritmo vai ter o seu proprio e nao quero corrumper o original
        .map vai criar um array com a info
        Arrow function serve de instrucao para o .map copiar as rows usando o ...
        ... aka spread operator vai deixar mais facil de pegar a info se fizere ...row neste caso ele vai deixar "exposto o valor" exemplo se printasse o array com os tres pontos antes ele ia me mostrar o conteudo todo sem usar um loop
        */
        const newBoard = board.map(row => [...row]);
        let row = -1;
        for(let r = ROWS -1; r >= 0;r--)
        {
            //Opa vou colocar aqui a minha ficha
            if(newBoard[r][col] === 0)
            {
                row = r;
                break;
            }
        }
        //jogou na humildade
        newBoard[row][col] = player;
        return {board: newBoard,row};
    }

    //Verifica se o estado esta em estado Terminal que signifca se alguem ganhou o jogo ou empatou
    private isTerminalNode(board: number[][],validCols: number[]): boolean
    {
        return (validCols.length === 0 || this.boardHasWinner(board,1) || this.boardHasWinner(board,2));
    }

    /*
        Tentativa de dar conhecimento ao amigo
    */

    private evaluateBoard(board: number[][],aiPlayer: number,opponent: number) : number
    {
        let score = 0;


        //Coluna Central da mais possibilidades de vitoria vamos prioriza la
        const centerCol = Math.floor(COLS / 2);
        for(let r = 0;r < ROWS;r++)
        {
            if(board[r][centerCol] === aiPlayer)
                score += 3;
        }

        const windows = this.getAllWindows(board);
        for(const window of windows)
        {
            score += this.scoreWindow(window,aiPlayer,opponent)
        }

        return score;
    }

    private getAllWindows(board: number[][]) : number[][]
    {
        const windows: number[][] = [];
        //Horizontal
        for (let r = 0; r < ROWS; r++)
        {
            for (let c = 0; c <= COLS - 4; c++)
            {
                windows.push([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]]);
            }
        }
        // Verticais
        for (let c = 0; c < COLS; c++)
        {
            for (let r = 0; r <= ROWS - 4; r++)
            {
                windows.push([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]]);
            }
        }
        // Diagonais \
        for (let r = 0; r <= ROWS - 4; r++)
        {
            for (let c = 0; c <= COLS - 4; c++)
            {
            windows.push([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]]);
            }
        }
        // Diagonais /
        for (let r = 3; r < ROWS; r++)
        {
            for (let c = 0; c <= COLS - 4; c++) 
            {
                windows.push([board[r][c], board[r - 1][c + 1], board[r - 2][c + 2], board[r - 3][c + 3]]);
            }
        }
    return windows;

    } 
    
    //Sistema de pontuacao para priorizar jogadas
    private scoreWindow(window: number[],aiPlayer: number,opponent: number): number
    {
        const aiCount = window.filter(cell => cell === aiPlayer).length;
        const oppCount = window.filter(cell => cell === opponent).length;
        const emptyCount = window.filter(cell => cell === 0).length;

        if(aiCount === 4)
            return 100;
        if(aiCount === 3 && emptyCount === 1)
            return 5;
        if(aiCount === 2 && emptyCount === 2)
            return 2;

        if(oppCount === 3 && emptyCount === 1)
            return -4;//Vai jogar para bloquear o adversario e vai prioriza lo 
        if(oppCount === 4)
                return -100;
        return 0;
    }
}
import { AiConfig } from './game.types';

const ROWS = 6;
const COLS = 7;
const WIN_SCORE = 1_000_000;

/*
    Ordem pela qual as colunas sao experimentadas: do centro para fora.
    A poda alpha-beta so corta bem se as jogadas boas forem testadas primeiro, e no
    4 em linha as jogadas boas estao quase sempre no centro. Testar por 0..6 e o pior
    caso possivel; esta ordem sozinha corta a procura para cerca de um decimo.
*/
const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];

//Coluna do meio (0..6) -> 3. E a que passa por mais linhas de 4, por isso vale mais
const CENTER_COL = Math.floor(COLS / 2);

//Uma jogada candidata na raiz da procura, com o valor que a procura lhe deu
export interface ScoredMove
{
    column: number;
    score: number;
}

export class ConnectFourAI
{
    /*
        Minimax com poda alpha-beta.

        NOTA sobre o estado interno (this.board / this.heights / this.emptyCells):
        a procura corre toda de forma sincrona, sem nenhum await pelo meio, e o Node
        e single-thread. Por isso mesmo havendo uma so instancia de ConnectFourAI
        partilhada por todos os jogos, nunca ha duas procuras a correr ao mesmo tempo.
        Cada chamada publica comeca por fazer loadBoard(), que poe este estado do zero.
    */

    //Copia de trabalho do board. E mutada durante a procura (makeMove/undoMove)
    private board: number[][] = [];

    //heights[c] = linha onde cai a proxima peca da coluna c. -1 significa coluna cheia
    private heights = new Int8Array(COLS);

    //Quantas casas vazias faltam. Chegar a 0 e empate
    private emptyCells = 0;

    /*
        Controlo do orcamento de tempo (so usado quando o nivel define timeBudgetMs).
        deadline = instante em que a procura tem de parar. Infinity = sem limite.
        aborted  = a procura atual estourou o tempo, o resultado dela nao presta.
        nodeCount serve para so ir ver as horas de 1024 em 1024 nos, porque chamar
        Date.now() em todos os nos era mais caro que a propria procura.
    */
    private deadline = Infinity;
    private aborted = false;
    private nodeCount = 0;

    //De quantos em quantos nos e que vamos ver as horas
    private static readonly TIME_CHECK_INTERVAL = 1024;

    /**
     * Escolhe a jogada da IA de acordo com o nivel de dificuldade.
     * @param board estado atual do tabuleiro (nao e modificado)
     * @param aiPlayer numero que representa a IA (1 ou 2)
     * @param config profundidade + probabilidade de erro do nivel
     */
    public getMove(board: number[][], aiPlayer: number, config: AiConfig): number
    {
        let moves: ScoredMove[];
        if (config.timeBudgetMs)
        {
            moves = this.searchIterative(board, aiPlayer, config.depth, config.timeBudgetMs);
        }
        else
        {
            //Sem orcamento: vai ate ao fim da profundidade pedida, custe o que custar
            this.deadline = Infinity;
            this.aborted = false;
            moves = this.searchFixedDepth(board, aiPlayer, config.depth);
        }

        //Board cheio, nao ha nada para jogar. Quem chama ja devia ter detetado o empate
        if (moves.length === 0)
            return -1;
        if (moves.length === 1)
            return moves[0].column;

        //Melhor score primeiro
        moves.sort((a, b) => b.score - a.score);
        const bestScore = moves[0].score;

        /*
            Blunder: de vez em quando a IA joga de proposito abaixo do seu nivel.
            Escolhemos a melhor das jogadas ESTRITAMENTE piores (a "2a melhor"), e nao
            simplesmente moves[1], porque moves[1] pode ter o mesmo score da melhor e
            nesse caso nao era erro nenhum.
        */
        if (config.blunderChance > 0 && Math.random() < config.blunderChance)
        {
            const worseMoves = moves.filter(move => move.score < bestScore);
            if (worseMoves.length > 0)
                return worseMoves[0].column;
        }

        /*
            Entre jogadas com exatamente o mesmo valor, escolhemos uma ao acaso.
            Sem isto a IA joga sempre a mesma coluna nas mesmas situacoes e fica
            completamente previsivel.
        */
        const tiedMoves = moves.filter(move => move.score === bestScore);
        return tiedMoves[Math.floor(Math.random() * tiedMoves.length)].column;
    }

    /**
     * Aprofundamento sucessivo: procura a profundidade 1, depois 2, depois 3... e vai
     * guardando o resultado de cada profundidade que consegue TERMINAR. Quando o tempo
     * acaba a meio de uma profundidade, essa e deitada fora e fica valendo a anterior.
     *
     * Porque e que isto existe: o custo de uma procura de profundidade fixa depende
     * muito da posicao. Medido em 60 posicoes, depth 9 foi de 1ms a 2.4s e depth 10
     * chegou a 2.7s. Como a procura e sincrona, esse tempo e tempo em que o servidor
     * inteiro fica bloqueado - todos os jogos, nao so este. Com orcamento de tempo a
     * IA aprofunda o que der em posicoes calmas e recua sozinha nas complicadas.
     *
     * O desperdicio de repetir as profundidades de baixo e pequeno: cada nivel custa
     * varias vezes o anterior, por isso a ultima procura domina o total.
     */
    private searchIterative(
        board: number[][],
        aiPlayer: number,
        maxDepth: number,
        budgetMs: number,
    ): ScoredMove[]
    {
        this.deadline = Date.now() + budgetMs;
        this.aborted = false;

        /*
            A profundidade 2 corre sempre e nunca chega a ser interrompida (sao poucas
            centenas de nos), o que garante que ha sempre uma resposta valida para
            devolver mesmo com um orcamento absurdamente pequeno.
        */
        let bestMoves = this.searchFixedDepth(board, aiPlayer, 2);

        /*
            De 2 em 2 e nao de 1 em 1, para acabar sempre numa profundidade PAR.
            Numa profundidade impar a procura termina logo a seguir a uma jogada da IA,
            sem contar com a resposta do adversario, e por isso a avaliacao fica
            optimista. A saltar entre par e impar de jogada para jogada a IA fica
            incoerente: medido em 30 jogos, o nivel hard assim so fazia 16-13 contra o
            medium apesar de procurar 4 a 6 jogadas mais fundo.
        */
        for (let depth = 4; depth <= maxDepth; depth += 2)
        {
            this.aborted = false;
            const moves = this.searchFixedDepth(board, aiPlayer, depth);

            //Estourou o tempo a meio: os scores desta profundidade estao incompletos
            if (this.aborted)
                break;

            bestMoves = moves;
        }

        //Deixar o estado limpo para a proxima chamada
        this.deadline = Infinity;
        this.aborted = false;
        return bestMoves;
    }

    /**
     * Avalia todas as jogadas possiveis a partir da posicao atual.
     *
     * O alpha vai sendo arrastado de jogada para jogada, tal como num alpha-beta normal.
     * Isso torna a procura muito mais rapida (sem isto, depth 10 passava de ~80ms para
     * ~2.5s) mas tem um efeito colateral: so o score da MELHOR jogada e exato. As outras
     * ficam com um limite superior - sabemos que nao valem mais do que a melhor, mas o
     * numero pode estar acima do valor real.
     *
     * Isso da empates falsos: jogadas piores aparecem com o mesmo score da melhor e,
     * como o getMove desempata a sorte, a IA acabava a jogar mal (num tabuleiro vazio
     * chegava a escolher a coluna 6 em vez da 3). Por isso ha uma segunda passagem que
     * confirma os empates, e so aqueles que sobrevivem contam como empate a serio.
     */
    private searchFixedDepth(board: number[][], aiPlayer: number, depth: number): ScoredMove[]
    {
        const opponent = aiPlayer === 1 ? 2 : 1;
        this.loadBoard(board);

        const moves: ScoredMove[] = [];
        let alpha = -Infinity;
        let bestColumn = -1;

        for (const col of COLUMN_ORDER)
        {
            const row = this.heights[col];
            if (row < 0)
                continue;//coluna cheia

            this.makeMove(col, row, aiPlayer);
            const score = this.createsWin(row, col, aiPlayer)
                ? WIN_SCORE + depth
                : this.minimax(depth - 1, alpha, Infinity, false, aiPlayer, opponent);
            this.undoMove(col, row);

            //Tempo esgotado: este score nao presta e os que faltam nem chegaram a ser vistos
            if (this.aborted)
                return moves;

            moves.push({ column: col, score });
            //Esta jogada e melhor que todas as anteriores: e ela que fixa o alpha e o score exato
            if (score > alpha)
            {
                alpha = score;
                bestColumn = col;
            }
        }

        /*
            Segunda passagem: confirmar quem esta mesmo empatado com a melhor jogada.
            Voltamos a procurar essas jogadas com a janela (alpha - 1, Infinity):
              - se o valor verdadeiro for >= alpha, a procura devolve-o exato -> empate a serio;
              - se for menor, devolve um numero abaixo de alpha -> deixa de contar como empate.
            E barato porque a janela ja entra apertada, e so corre para as candidatas.
        */
        for (const move of moves)
        {
            if (move.column === bestColumn || move.score < alpha)
                continue;
            move.score = this.searchColumn(move.column, depth, alpha - 1, aiPlayer, opponent);
            if (this.aborted)
                break;
        }

        return moves;
    }

    //Procura uma unica jogada da raiz com um alpha a escolha. Usado na confirmacao de empates
    private searchColumn(
        col: number,
        depth: number,
        alpha: number,
        aiPlayer: number,
        opponent: number,
    ): number
    {
        const row = this.heights[col];
        this.makeMove(col, row, aiPlayer);
        const score = this.createsWin(row, col, aiPlayer)
            ? WIN_SCORE + depth
            : this.minimax(depth - 1, alpha, Infinity, false, aiPlayer, opponent);
        this.undoMove(col, row);
        return score;
    }

    /**
     * Minimax com poda alpha-beta. Devolve apenas o valor da posicao; quem escolhe a
     * coluna e o searchRoot.
     * @param depth jogadas que ainda faltam ver
     * @param maximizing true quando e a vez da IA
     */
    private minimax(
        depth: number,
        alpha: number,
        beta: number,
        maximizing: boolean,
        aiPlayer: number,
        opponent: number,
    ): number
    {
        /*
            Controlo do orcamento de tempo. So vamos ver as horas de 1024 em 1024 nos
            porque Date.now() em cada no custava mais que a procura em si. Assim que
            estoura, toda a arvore desenrola de volta a devolver 0 - esses valores nao
            sao usados, quem chamou deita fora a profundidade inteira.
        */
        if (this.aborted)
            return 0;
        if (++this.nodeCount >= ConnectFourAI.TIME_CHECK_INTERVAL)
        {
            this.nodeCount = 0;
            if (Date.now() > this.deadline)
            {
                this.aborted = true;
                return 0;
            }
        }

        /*
            Empate: o board encheu e ninguem ganhou (se alguem tivesse ganho, a jogada
            que ganhou ja tinha sido pontuada la em cima e nunca chegavamos aqui).
            Um empate nao e bom nem mau, vale exatamente 0.
        */
        if (this.emptyCells === 0)
            return 0;

        //Acabou a profundidade mas o jogo continua: damos um palpite heuristico
        if (depth === 0)
            return this.evaluateBoard(aiPlayer, opponent);

        if (maximizing)
        {
            let value = -Infinity;
            for (const col of COLUMN_ORDER)
            {
                const row = this.heights[col];
                if (row < 0)
                    continue;

                this.makeMove(col, row, aiPlayer);
                /*
                    So quem acabou de jogar pode ter feito 4 em linha, e so nas linhas
                    que passam pela peca que caiu. Por isso basta olhar a volta dela em
                    vez de varrer o tabuleiro todo.

                    O "+ depth" faz com que ganhar mais cedo valha mais: quanto mais
                    perto da raiz for a vitoria, maior e o depth que sobra. Sem isto
                    todas as vitorias valiam o mesmo e a IA arrastava jogos ja ganhos.
                */
                const score = this.createsWin(row, col, aiPlayer)
                    ? WIN_SCORE + depth
                    : this.minimax(depth - 1, alpha, beta, false, aiPlayer, opponent);
                this.undoMove(col, row);

                if (score > value)
                    value = score;
                if (value > alpha)
                    alpha = value;
                //O minimizador ja tem melhor alternativa noutro ramo, nao vale a pena continuar
                if (alpha >= beta)
                    break;
            }
            return value;
        }
        else
        {
            let value = Infinity;
            for (const col of COLUMN_ORDER)
            {
                const row = this.heights[col];
                if (row < 0)
                    continue;

                this.makeMove(col, row, opponent);
                //Simetrico do lado de cima: perder mais tarde e menos mau que perder ja
                const score = this.createsWin(row, col, opponent)
                    ? -(WIN_SCORE + depth)
                    : this.minimax(depth - 1, alpha, beta, true, aiPlayer, opponent);
                this.undoMove(col, row);

                if (score < value)
                    value = score;
                if (value < beta)
                    beta = value;
                if (alpha >= beta)
                    break;
            }
            return value;
        }
    }

    /*
        ------------------------------------------------------------------
        Gestao do tabuleiro de trabalho
        ------------------------------------------------------------------
    */

    /**
     * Copia o board recebido para a copia de trabalho e prepara heights/emptyCells.
     * A copia e feita UMA vez por procura (antes era feita em cada no da arvore),
     * e garante que o board vivo do GameService nunca e tocado.
     */
    private loadBoard(board: number[][]): void
    {
        this.board = board.map(row => [...row]);
        this.emptyCells = 0;

        for (let c = 0; c < COLS; c++)
        {
            //Procura de baixo para cima a primeira casa livre desta coluna
            let row = ROWS - 1;
            while (row >= 0 && this.board[row][c] !== 0)
                row--;

            this.heights[c] = row;//-1 se a coluna estiver cheia
            this.emptyCells += row + 1;
        }
    }

    //Poe uma peca. row tem de ser o heights[col] atual (quem chama ja o leu)
    private makeMove(col: number, row: number, player: number): void
    {
        if (row < 0)
            throw new Error(`ConnectFourAI: tentativa de jogar na coluna cheia ${col}`);

        this.board[row][col] = player;
        this.heights[col] = row - 1;
        this.emptyCells--;
    }

    /*
        Desfaz a jogada anterior. E este par makeMove/undoMove que substitui a copia
        do tabuleiro em cada no: em vez de criar 7 arrays novos por no, mexemos sempre
        no mesmo tabuleiro e voltamos atras a seguir.
    */
    private undoMove(col: number, row: number): void
    {
        this.board[row][col] = 0;
        this.heights[col] = row;
        this.emptyCells++;
    }

    /**
     * A peca que acabou de cair em (row,col) fecha 4 em linha?
     * Percorre os 4 eixos, contando para os dois lados a partir da peca nova.
     */
    private createsWin(row: number, col: number, player: number): boolean
    {
        const axes = [
            [0, 1],  // horizontal
            [1, 0],  // vertical
            [1, 1],  // diagonal \
            [1, -1], // diagonal /
        ];

        for (const [dr, dc] of axes)
        {
            let count = 1;//a peca que acabou de cair

            //sentido +1 e depois sentido -1 ao longo do mesmo eixo
            for (const sign of [1, -1])
            {
                let r = row + dr * sign;
                let c = col + dc * sign;
                while (r >= 0 && r < ROWS && c >= 0 && c < COLS && this.board[r][c] === player)
                {
                    count++;
                    r += dr * sign;
                    c += dc * sign;
                }
            }

            if (count >= 4)
                return true;
        }
        return false;
    }

    /*
        ------------------------------------------------------------------
        Heuristica: quanto vale uma posicao onde ainda ninguem ganhou
        ------------------------------------------------------------------
    */

    /**
     * Soma o valor de todas as janelas de 4 casas do tabuleiro, do ponto de vista da IA.
     * Positivo = bom para a IA, negativo = bom para o adversario.
     *
     * Nao aloca nada: percorre as janelas com indices em vez de construir arrays.
     */
    private evaluateBoard(aiPlayer: number, opponent: number): number
    {
        const b = this.board;
        let score = 0;

        //Controlar a coluna central da mais linhas de 4 possiveis, por isso conta para os dois lados
        for (let r = 0; r < ROWS; r++)
        {
            const cell = b[r][CENTER_COL];
            if (cell === aiPlayer)
                score += 3;
            else if (cell === opponent)
                score -= 3;
        }

        //Horizontais
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c <= COLS - 4; c++)
                score += this.scoreWindow(b[r][c], b[r][c + 1], b[r][c + 2], b[r][c + 3], aiPlayer, opponent);

        //Verticais
        for (let c = 0; c < COLS; c++)
            for (let r = 0; r <= ROWS - 4; r++)
                score += this.scoreWindow(b[r][c], b[r + 1][c], b[r + 2][c], b[r + 3][c], aiPlayer, opponent);

        //Diagonais \
        for (let r = 0; r <= ROWS - 4; r++)
            for (let c = 0; c <= COLS - 4; c++)
                score += this.scoreWindow(b[r][c], b[r + 1][c + 1], b[r + 2][c + 2], b[r + 3][c + 3], aiPlayer, opponent);

        //Diagonais /
        for (let r = 3; r < ROWS; r++)
            for (let c = 0; c <= COLS - 4; c++)
                score += this.scoreWindow(b[r][c], b[r - 1][c + 1], b[r - 2][c + 2], b[r - 3][c + 3], aiPlayer, opponent);

        return score;
    }

    /**
     * Valor de uma janela de 4 casas seguidas. Recebe as 4 casas soltas (e nao um array)
     * exatamente para nao alocar nada: isto e chamado 69 vezes por folha da arvore.
     */
    private scoreWindow(
        a: number,
        b: number,
        c: number,
        d: number,
        aiPlayer: number,
        opponent: number,
    ): number
    {
        let aiCount = 0;
        let oppCount = 0;

        if (a === aiPlayer) aiCount++; else if (a === opponent) oppCount++;
        if (b === aiPlayer) aiCount++; else if (b === opponent) oppCount++;
        if (c === aiPlayer) aiCount++; else if (c === opponent) oppCount++;
        if (d === aiPlayer) aiCount++; else if (d === opponent) oppCount++;

        //Janela disputada: com pecas dos dois ninguem consegue la fazer 4 em linha
        if (aiCount > 0 && oppCount > 0)
            return 0;

        if (oppCount === 0)
        {
            //(o 4 so aparece se nos passarem um board com um jogo ja ganho)
            if (aiCount >= 3)
                return 5;
            if (aiCount === 2)
                return 2;
            return 0;
        }

        /*
            Ameacas do adversario valem um pouco menos em valor absoluto do que as nossas
            (5/2 contra 4/2), o que da a IA um feitio ligeiramente ofensivo: em igualdade
            de circunstancias prefere construir a bloquear.
        */
        if (oppCount >= 3)
            return -4;
        if (oppCount === 2)
            return -2;
        return 0;
    }
}

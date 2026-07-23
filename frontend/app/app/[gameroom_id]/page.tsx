"use client";
import styles from "./page.module.css"
import { useState } from "react";

const ROWS = 6;
const COLUMNS = 7;
const EMPTY = " ";
const PLAYER_RED = "R";
const PLAYER_YELLOW = "Y";
const WIN_LENGTH = 4;

// Direções a verificar: horizontal, vertical, diagonal "\" e diagonal "/"
const DIRECTIONS = [
	[0, 1],
	[1, 0],
	[1, 1],
	[1, -1],
];

function createEmptyBoard(): string[][] {
	return Array.from({ length: ROWS }, () => Array(COLUMNS).fill(EMPTY));
}

// Encontra a linha mais baixa vazia numa coluna (gravidade). -1 se estiver cheia.
function lowestEmptyRow(board: string[][], c: number): number {
	for (let r = ROWS - 1; r >= 0; r--) {
		if (board[r][c] === EMPTY)
			return r;
	}
	return -1;
}

// Verifica se a peça acabada de colocar em (r, c) fecha 4 em linha.
function isWinningMove(board: string[][], r: number, c: number, player: string): boolean {
	for (const [dr, dc] of DIRECTIONS) {
		let count = 1;
		// Conta numa direção e na oposta a partir da peça colocada.
		for (const sign of [1, -1]) {
			let nr = r + dr * sign;
			let nc = c + dc * sign;
			while (
				nr >= 0 && nr < ROWS &&
				nc >= 0 && nc < COLUMNS &&
				board[nr][nc] === player
			) {
				count++;
				nr += dr * sign;
				nc += dc * sign;
			}
		}
		if (count >= WIN_LENGTH)
			return true;
	}
	return false;
}

export default function Page() {

	const [board, setBoard] = useState<string[][]>(createEmptyBoard);
	const [currentPlayer, setCurrentPlayer] = useState(PLAYER_RED);
	const [winner, setWinner] = useState<string | null>(null);
	const [isDraw, setIsDraw] = useState(false);

	const gameOver = winner !== null || isDraw;

	function dropPiece(c: number) {
		if (gameOver)
			return;

		const r = lowestEmptyRow(board, c);
		if (r === -1)
			return; // coluna cheia

		const nextBoard = board.map(row => [...row]);
		nextBoard[r][c] = currentPlayer;
		setBoard(nextBoard);

		if (isWinningMove(nextBoard, r, c, currentPlayer)) {
			setWinner(currentPlayer);
			return;
		}

		if (nextBoard.every(row => row.every(cell => cell !== EMPTY))) {
			setIsDraw(true);
			return;
		}

		setCurrentPlayer(currentPlayer === PLAYER_RED ? PLAYER_YELLOW : PLAYER_RED);
	}

	function resetGame() {
		setBoard(createEmptyBoard());
		setCurrentPlayer(PLAYER_RED);
		setWinner(null);
		setIsDraw(false);
	}

	function tileClassName(cell: string) {
		if (cell === PLAYER_RED)
			return `${styles.tile} ${styles["red-piece"]}`;
		if (cell === PLAYER_YELLOW)
			return `${styles.tile} ${styles["yellow-piece"]}`;
		return styles.tile;
	}

	function statusText() {
		if (winner)
			return `Vencedor: ${winner === PLAYER_RED ? "Vermelho" : "Amarelo"}!`;
		if (isDraw)
			return "Empate!";
		return `Vez do jogador: ${currentPlayer === PLAYER_RED ? "Vermelho" : "Amarelo"}`;
	}

	return (

		<div className={styles.container}>
			<div className={styles.status}>{statusText()}</div>

			<div className={styles.board} id="board">
				{board.map((row, r) =>
					row.map((cell, c) => (
						<div
							key={`${r}-${c}`}
							id={`${r}-${c}`}
							className={tileClassName(cell)}
							onClick={() => dropPiece(c)}
						/>
					))
				)}
			</div>

			<button className={styles.reset} onClick={resetGame}>
				Reiniciar
			</button>
		</div>
	)
}

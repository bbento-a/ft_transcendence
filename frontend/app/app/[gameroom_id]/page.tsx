"use client";
import styles from "./page.module.css"
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useGameSocket } from "../hooks/useGameSocket";

import ExitPopUp from "../components/exitPopUp";

const ROWS = 6;
const COLUMNS = 7;

// Empty board shown before a match starts, so the page looks like the game board
// even while we are connecting / waiting for an opponent.
function emptyBoard(): number[][] {
	return Array.from({ length: ROWS }, () => Array(COLUMNS).fill(0));
}

export default function Page() {
	const router = useRouter();
	const params = useParams();
	const [togglePopUp, setTogglePopUp] = useState(false);
	const { state, status, connected, playAI, findMatch, play } = useGameSocket();

	// Start the game once connected. The route segment carries the mode:
	//   /ai    -> play vs the bot        /match -> matchmaking with a person
	const started = useRef(false);
	useEffect(() => {
		if (!connected || started.current) return;
		started.current = true;
		if (params?.gameroom_id === "ai") playAI();
		else findMatch();
	}, [connected, params, playAI, findMatch]);

	// Server board when a match is live; empty board otherwise.
	const board = state ? state.board : emptyBoard();

	function tileClassName(cell: number) {
		if (cell === 1)
			return `${styles.tile} ${styles["light-piece"]}`;
		if (cell === 2)
			return `${styles.tile} ${styles["dark-piece"]}`;
		return styles.tile;
	}

	function statusText() {
		if (!state)
			return status || (connected ? "Looking for opponent..." : "Connecting...");
		if (state.isGameOver) {
			if (state.winnerId === null)
				return "Draw!";
			// map the winner id to the colour (player1 = Red, player2 = Yellow)
			return `Winner: ${state.winnerId === state.player1Id ? "Red" : "Yellow"}!`;
		}
		return `${state.currentPlayer === 1 ? "Red" : "Yellow"}'s Turn`;
	}

	function turnImage(){
		if (state === null)
			return
		else if (state.currentPlayer === 1)
			return <Image width={20} height={20} sizes="100vw" alt="" src="/pieceLighter.svg" />
		return <Image width={20} height={20} sizes="100vw" alt="" src="/pieceDark.svg" />
	}
	// function resetGame(){
	// 	return 1
	// }

	return (
	<div className={styles.pageWrapper}>
		<div className={styles.sides}>
			<div className={styles.playerText}>Player1</div>
		</div>
		<div className={styles.container}>
			<div className={styles.status}>
				{turnImage()}
				<div className={styles.statusText}>{statusText()}</div>
				{turnImage()}
			</div>

			<div className={styles.board} id="board">
				{board.map((row, r) =>
					row.map((cell, c) => (
						<div
							key={`${r}-${c}`}
							id={`${r}-${c}`}
							className={tileClassName(cell)}
							onClick={() => play(c)}
						/>
					))
				)}
			</div>

			{/* <button className={styles.rematch} onClick={resetGame()}>
				Rematch
			</button> */}
		</div>
		<div className={styles.sides}>
			<div className={styles.playerText}>Player2</div>
		</div>
		<div className={styles.buttonWrapper}>
			<button onClick={() => {router.push("/gamerooms")}}>
				<Image className={styles.buttonIcon} width={30} height={30} sizes="100vw" alt="" src={"/arrow.svg"}></Image>
			</button>
		</div>
		{
			togglePopUp && 
			<div className={styles.popUpWrapper}>
				<ExitPopUp></ExitPopUp>
			</div>
		}
	</div>
	)
}

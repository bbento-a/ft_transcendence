"use client";
import styles from "./page.module.css"
import Image from "next/image";
import { useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useGameSocket } from "../hooks/useGameSocket";

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
	const {
		state, status, connected, inRoom, roomUnavailable, playAI, enterRoom, leaveRoom, play,
	} = useGameSocket();

	const roomId = typeof params?.gameroom_id === "string" ? params.gameroom_id : null;

	// Once connected, act on the route: /ai is the bot, anything else is a room
	// id. The server decides what we become in that room (player or spectator).
	const started = useRef(false);
	useEffect(() => {
		if (!connected || started.current || !roomId) return;
		started.current = true;
		if (roomId === "ai") playAI();
		else enterRoom(roomId);
	}, [connected, roomId, playAI, enterRoom]);

	// No such room (a stale link or a hand-typed URL): back to the lobby.
	useEffect(() => {
		if (roomUnavailable) router.push("/gamerooms");
	}, [roomUnavailable, router]);

	// Back button: tell the server before leaving, so an empty room we hosted
	// disappears from the lobby straight away instead of after the grace period.
	function handleBack() {
		leaveRoom();
		router.push("/gamerooms");
	}

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
			return `Winner: ${state.winnerId === state.player1Id ? state.player1Name : state.player2Name}!`;
		}
		return `${state.currentPlayer === 1 ? state.player1Name : state.player2Name}'s Turn`;
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
			<div className={styles.playerText}>{state?.player1Name ?? "Player1"}</div>

		</div>
		<div className={styles.container}>
			<div className={styles.status}>
				{turnImage()}
				<div className={styles.statusText}>{statusText()}</div>
				{turnImage()}
			</div>

			{/* Wait for the server to confirm the room before drawing the board,
			    so a bad room id never flashes a game before redirecting. */}
			{inRoom && (
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
			)}
{/* 
			<button className={styles.reset} onClick={resetGame()}>
				Restart
			</button> */}
		</div>
		<div className={styles.sides}>
			<div className={styles.playerText}>{state?.player2Name ?? "Player2"}</div>
		</div>
		<div className={styles.buttonWrapper}>
			<button onClick={handleBack}>
				<Image className={styles.buttonIcon} width={30} height={30} sizes="100vw" alt="" src={"/arrow.svg"}></Image>
			</button>
		</div>
	</div>
	)
}

"use client";
import styles from "./page.module.css"
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useGameSocket } from "../hooks/useGameSocket";

import ExitPopUp from "../components/exitPopUp";
import { subtle } from "crypto";

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
	// Exit confirmation from dev. The popup itself is still a static shell, so
	// nothing sets this to true yet — see the note in handleBack below.
	const [togglePopUp, setTogglePopUp] = useState(false);
	const {
		state, status, connected, inRoom, roomUnavailable, forfeit, myName,
		playAI, enterRoom, leaveRoom, play,
		requestRematch, iWantRematch, opponentWantsRematch,
	} = useGameSocket();

	// Once a game is running the server tells us both names. Before that the only
	// person on this page is the host waiting for someone, so that side is us.
	const leftName = state?.player1Name ?? myName ?? "Player1";
	const rightName = state?.player2Name ?? "Player2";

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
		// Someone dropped out: name them and show how long they have to come back.
		if (forfeit)
			return `${forfeit.message} Forfeit in ${forfeit.secondsLeft}s`;
		return `${state.currentPlayer === 1 ? state.player1Name : state.player2Name}'s Turn`;
	}

	function turnImage(){
		if (state === null)
			return
		else if (state.currentPlayer === 1)
			return <Image width={20} height={20} sizes="100vw" alt="" src="/pieceLighter.svg" />
		return <Image width={20} height={20} sizes="100vw" alt="" src="/pieceDark.svg" />
	}
	// A rematch needs both players, so the button doubles as the reply to an
	// offer. Against the bot it just starts the next game.
	function rematchLabel() {
		if (opponentWantsRematch)
			return "Accept rematch";
		if (iWantRematch)
			return "Waiting for opponent...";
		return "Rematch";
	}

	return (
	<div className={styles.pageWrapper}>
		<div className={styles.sideLeft}>
			<div className={styles.playerText}>{leftName}</div>

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
			{/* Only once the game is over. Disabled while our own offer stands,
			    so the label reads as a status instead of an action. */}
			<div className={styles.centerButton}>
				{state?.isGameOver && (
				<button
					className={styles.rematch}
					onClick={requestRematch}
					disabled={iWantRematch && !opponentWantsRematch}
				>
					{rematchLabel()}
				</button>
				)}
			</div>
		</div>
		<div className={styles.sideRight}>
			<div className={styles.playerText}>{rightName}</div>
		</div>
		<div className={styles.buttonWrapper}>
			<button className={styles.buttonIcon} onClick={handleBack}>
				<Image width={30} height={30} sizes="100vw" alt="" src={"/arrow.svg"}></Image>
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

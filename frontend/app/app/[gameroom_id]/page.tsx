"use client";
import styles from "./page.module.css"
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useGameSocket } from "../hooks/useGameSocket";

import ExitPopUp from "../components/exitPopUp";
import { useNavGuard } from "@/context/NavGuardContext";

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
	// Exit confirmation: opens only when walking out of a LIVE match (back
	// button or the navbar's wawa icon). Leaving any other room state skips
	// the question and just leaves.
	const [togglePopUp, setTogglePopUp] = useState(false);
	// Where the person was heading when the popup intercepted them, so "Leave"
	// finishes that navigation instead of always dumping them in the lobby.
	const [pendingHref, setPendingHref] = useState<string | null>(null);
	// Saida pedida, a espera da confirmacao do servidor. Trava o botao para os
	// cliques seguintes nao dispararem outra saida enquanto a primeira decorre.
	const [leaving, setLeaving] = useState(false);
	const { setGuard } = useNavGuard();
	const {
		state, status, connected, inRoom, roomUnavailable, forfeit, myName, myPlayerNumber,
		playAI, enterRoom, leaveRoom, play,
		requestRematch, iWantRematch, opponentWantsRematch,
	} = useGameSocket();

	// Only a PLAYER in a game still running has something to lose by leaving:
	// the backend records that exit as a forfeit, against a human or the bot
	// alike. Spectators, a host waiting alone and finished games exit freely.
	//
	// An untouched board counts as nothing to lose either: with no piece played
	// the server records no result, so asking "are you sure?" would be a warning
	// about a forfeit that is not going to happen.
	const anyPiecePlayed = !!state && state.board.some((row) => row.some((cell) => cell !== 0));
	const liveGame =
		!!state && !state.isGameOver && myPlayerNumber !== null && anyPiecePlayed;

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

	// O guard fica registado enquanto estivermos numa sala, mas tem de correr
	// sempre a logica mais recente. Guardamo-la numa ref: re-registar a cada
	// render punha o contexto a atualizar em ciclo.
	const navAttemptRef = useRef<(href: string) => void>(() => {});
	useEffect(() => {
		navAttemptRef.current = (href: string) => {
			// A match with pieces on the board: ask first, leaving costs a loss.
			if (liveGame) {
				setPendingHref(href);
				setTogglePopUp(true);
				return;
			}
			// Anything else (waiting for an opponent, game over, spectating):
			// leave straight away, exactly like the back arrow. It still goes
			// through leaveRoom, so a room we were waiting in is dropped now
			// instead of lingering until the host grace period runs out.
			confirmLeave(href);
		};
	});

	// Guard the navbar for as long as we are inside a room, whatever its state:
	// the wawa icon must never navigate out without telling the server first.
	useEffect(() => {
		if (!inRoom) return;
		setGuard((href) => {
			navAttemptRef.current(href);
			return true; // intercepted: the page owns this navigation now
		});
		return () => setGuard(null);
	}, [inRoom, setGuard]);

	// The question stops making sense if the game ends while it is on screen
	// (opponent left, game over): leaving is free now, so drop the popup.
	useEffect(() => {
		if (!liveGame) {
			setTogglePopUp(false);
			setPendingHref(null);
		}
	}, [liveGame]);

	// Actually leave: tell the server, so an empty room we hosted disappears
	// from the lobby straight away instead of after the grace period.
	// Saimos ja, sem esperar pela resposta: quem espera pela confirmacao e o
	// fecho do socket, la dentro do hook, para o pedido nao morrer com ele.
	function confirmLeave(href: string) {
		if (leaving) return; // segundo clique: o pedido ja seguiu
		setLeaving(true);
		setTogglePopUp(false);
		leaveRoom();
		router.push(href);
	}

	// Back button: mid-match it only ASKS (the popup decides); any other state
	// — waiting alone, game over, spectating — leaves straight away.
	function handleBack() {
		if (leaving) return;
		if (liveGame) {
			setPendingHref("/gamerooms");
			setTogglePopUp(true);
			return;
		}
		confirmLeave("/gamerooms");
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
		{!inRoom || leaving ? (
		// Enquanto o socket liga e a sala nao esta confirmada — ou ja pedimos
		// para sair: so o spinner, sem texto, em vez do esqueleto do jogo. No
		// caso do "leaving", e o que faz o clique parecer imediato mesmo quando
		// a navegacao para o lobby demora (ex.: modo dev acabado de compilar).
		<div className={styles.connecting}>
			<div className={styles.spinner} />
		</div>
		) : (
		<>
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
			<button className={styles.buttonIcon} onClick={handleBack} disabled={leaving}>
				<Image width={30} height={30} sizes="100vw" alt="" src={"/arrow.svg"}></Image>
			</button>
		</div>
		</>
		)}
		{
			togglePopUp &&
			<div className={styles.popUpWrapper}>
				<ExitPopUp
					onStay={() => { setTogglePopUp(false); setPendingHref(null); }}
					onLeave={() => confirmLeave(pendingHref ?? "/gamerooms")}
				></ExitPopUp>
			</div>
		}
	</div>
	)
}

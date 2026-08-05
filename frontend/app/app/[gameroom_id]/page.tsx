"use client";
import styles from "./page.module.css"
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTransitionRouter } from "next-view-transitions";
import { useTranslations } from "next-intl";
import { useGameSocket } from "../hooks/useGameSocket";
import { AI_PLAYER_ID, DIFFICULTIES } from "../types/game";

import { useNavGuard } from "@/context/NavGuardContext";

import ExitPopUp from "../components/exitPopUp";
import BackArrow from "../components/backArrow";

const ROWS = 6;
const COLUMNS = 7;

// Empty board shown before a match starts, so the page looks like the game board
// even while we are connecting / waiting for an opponent.
function emptyBoard(): number[][] {
	return Array.from({ length: ROWS }, () => Array(COLUMNS).fill(0));
}

export default function Page() {
	// Router com view transitions: sair da sala anima de volta como entrar nela.
	const router = useTransitionRouter();
	const params = useParams();
	const t = useTranslations("gameroom_id");
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

	// Nivel do bot, por baixo do nome dele: sem isto um jogo no facil e um no
	// dificil sao o mesmo "Bot" no ecra. So o lado da IA e que o mostra — o
	// servidor poe a IA no player2, mas verificamos os dois lados na mesma.
	const tGame = useTranslations("game");
	const difficultyLabel = state?.difficulty ? tGame(state.difficulty) : null;
	const leftDifficulty = state?.player1Id === AI_PLAYER_ID ? difficultyLabel : null;
	const rightDifficulty = state?.player2Id === AI_PLAYER_ID ? difficultyLabel : null;

	const roomId = typeof params?.gameroom_id === "string" ? params.gameroom_id : null;

	// Once connected, act on the route: /ai is the bot, anything else is a room
	// id. The server decides what we become in that room (player or spectator).
	const started = useRef(false);
	useEffect(() => {
		if (!connected || started.current || !roomId) return;
		started.current = true;
		if (roomId === "ai") {
			// A dificuldade vem do widget do lobby via query (?difficulty=easy).
			// Lida do window e nao de useSearchParams: este efeito so corre no
			// cliente e assim a pagina nao precisa de um Suspense boundary. Um
			// valor invalido (URL a mao) e filtrado aqui e de novo no backend.
			const requested = new URLSearchParams(window.location.search).get("difficulty");
			playAI(DIFFICULTIES.find((level) => level === requested));
		}
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
			return status || (connected ? `${t("Looking for opponent")}...` : `${t("Connecting")}...`);
		if (state.isGameOver) {
			if (state.winnerId === null)
				return `${t("Draw")}!`;
			return `${t("Winner")}: ${state.winnerId === state.player1Id ? state.player1Name : state.player2Name}!`;
		}
		// Someone dropped out: name them and show how long they have to come back.
		if (forfeit)
			return `${forfeit.message} ${t("Forfeit in")} ${forfeit.secondsLeft}`;
		return `${t("Current turn")}: ${state.currentPlayer === 1 ? state.player1Name : state.player2Name}`;
	}

	function turnImage(){
		if (state === null)
			return
		else if (state.currentPlayer === 1)
			return <Image className={styles.fixPieceSize} width="0" height="0" sizes="100vw" alt="" src="/pieceLighter.svg" />
		return <Image className={styles.fixPieceSize} width="0" height="0" sizes="100vw" alt="" src="/pieceDark.svg" />
	}
	// A rematch needs both players, so the button doubles as the reply to an
	// offer. Against the bot it just starts the next game.
	function rematchLabel() {
		if (opponentWantsRematch)
			return t("Accept rematch");
		if (iWantRematch)
			return `${t("Waiting for opponent")}...`;
		return t("Rematch");
	}

	return (
	<div className={styles.pageWrapper}>
		{!inRoom && !leaving ? (
		// Enquanto o socket liga e a sala nao esta confirmada: so o spinner, sem
		// texto, em vez do esqueleto do jogo. Durante o "leaving" e ao contrario
		// — mantemos o jogo no ecra: a view transition congela um snapshot dele
		// e desvanece-o; trocar para o spinner antes dessa captura fazia a
		// pagina piscar (jogo -> spinner -> fade).
		<div className={styles.connecting}>
			<div className={styles.spinner} />
		</div>
		) : (
		<>
		<div className={styles.sideLeft}>
			<div className={styles.playerBlock}>
				<div className={styles.playerText}>{leftName}</div>
				{leftDifficulty && <div className={styles.playerDifficulty}>{leftDifficulty}</div>}
			</div>
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
			<div className={styles.playerBlock}>
				<div className={styles.playerText}>{rightName}</div>
				{rightDifficulty && <div className={styles.playerDifficulty}>{rightDifficulty}</div>}
			</div>
		</div>
		{/* Aqui a seta NAO pode ser um router.back() simples: tem de avisar o
		    servidor (leaveRoom) e, a meio de uma partida, perguntar primeiro. */}
		<div className={styles.buttonWrapper}>
			<BackArrow onClick={handleBack} disabled={leaving} />
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

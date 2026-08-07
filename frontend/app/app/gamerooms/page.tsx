"use client";
import styles from "./page.module.css"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
// O router da next-view-transitions e o do Next com push/replace embrulhados
// em document.startViewTransition — e isso que anima a troca de pagina.
import { useTransitionRouter } from "next-view-transitions"

import GameroomWidget from "../components/gameroomWidget"
import DifficultyWidget from "../components/difficultyWidget"
import GamePopUp from "../components/gamePopUp"
import useClickOutside from "../hooks/useClickOutside"
import RequireAuth from "../components/requireAuth"
import { useGameSocket } from "../hooks/useGameSocket"
import { useTranslations } from "next-intl";

export default function Home() {
	const [toggled, setToggle] = useState(false);
	const [difficulty, setDifficulty] = useState(false);
	const popupRef = useRef<HTMLDivElement>(null);
	const router = useTransitionRouter();

	const t = useTranslations("gamerooms");
	// texto que so os leitores de ecra veem, ver namespace a11y
	const tA11y = useTranslations("a11y");

	const { rooms, roomsLoaded, connected, getRooms, createRoom, createdRoomId, resumeRoomId } = useGameSocket();

	// "Play vs someone" tem uma ida ao servidor ANTES de haver navegacao — a
	// transicao nao cobre essa espera, por isso e o proprio botao que mostra um
	// spinner ate o createdRoomId chegar.
	const [creatingRoom, setCreatingRoom] = useState(false);

	// Rede de seguranca: se o servidor nunca responder, o botao nao pode ficar
	// preso no spinner para sempre.
	useEffect(() => {
		if (!creatingRoom) return;
		const timer = setTimeout(() => setCreatingRoom(false), 8000);
		return () => clearTimeout(timer);
	}, [creatingRoom]);

	useClickOutside([popupRef], () => setToggle(false), toggled);

	// Fechar o popup fecha tambem o widget de dificuldade, senao ao reabrir o
	// popup ele ja vinha aberto da vez anterior.
	useEffect(() => {
		if (!toggled) setDifficulty(false);
	}, [toggled]);

	// A rota [gameroom_id] e a mesma para qualquer sala, por isso prefetch de um
	// id qualquer (/ai) ja descarrega o chunk dela — o push depois e imediato.
	useEffect(() => {
		router.prefetch("/ai");
	}, [router]);

	// Ask once we are connected; the server pushes every change after that.
	useEffect(() => {
		if (connected) getRooms();
	}, [connected, getRooms]);

	// Our room exists now, so we can walk into it by its real id.
	useEffect(() => {
		if (createdRoomId) router.push(`/${createdRoomId}`);
	}, [createdRoomId, router]);

	// We are still in a game we never left, so go back to it. `replace` keeps the
	// lobby out of the history: the game's back button must lead somewhere.
	useEffect(() => {
		if (resumeRoomId) router.replace(`/${resumeRoomId}`);
	}, [resumeRoomId, router]);

  return (
	<RequireAuth>
	<div className={styles.pageWrapper}>
		<div className={styles.wrapperScroll}>

		{
			// Spinner em vez da lista quando: ainda a carregar; a criar a nossa
			// sala (o servidor atualiza a lista ANTES de mandar o createdRoomId,
			// senao via-se o widget da sala nova aparecer no lobby mesmo antes da
			// navegacao); ou a voltar a um jogo que nunca deixamos.
			!roomsLoaded || creatingRoom || resumeRoomId ? (
				<div className={styles.textWrapper}>
					<div className={styles.spinner} aria-label={tA11y("loading")} />
				</div>
			) : rooms.length === 0 ? (
				<div className={styles.textWrapper}>
					<div className={styles.noGameRooms}>{t("NoGameRooms")}</div>
				</div>
			) : (
				rooms.map((room) => (
					<GameroomWidget
						key={room.id}
						room={room}
						onEnter={(roomId) => router.push(`/${roomId}`)}
					/>
				))
			)
		}

		</div>
		<div ref={popupRef} className={styles.buttonWrapper}>
			{
				toggled &&
				<GamePopUp
					creating={creatingRoom}
					onPlayVsSomeone={() => {
						setCreatingRoom(true);
						createRoom();
					}}
					onPlayVsBot={() => setDifficulty((open) => !open)}
				></GamePopUp>
			}
			{
				// "Play vs bot" abre isto em vez de navegar logo: escolher o nivel
				// e que arranca o jogo, com a dificuldade a viajar no URL para a
				// pagina /ai a mandar no playVsAI.
				toggled && difficulty &&
				<DifficultyWidget
					onSelect={(level) => router.push(`/ai?difficulty=${level}`)}
				></DifficultyWidget>
			}
			<button onClick={() => {setToggle(!toggled)}} className={styles.buttonWrapper}>
				<Image className={styles.gameroomIcon} width={70} height={70} sizes="100vw" alt="" src="/gameroom.svg" loading="eager"/>
			</button>
		</div>
	</div>
	</RequireAuth>
  )
}

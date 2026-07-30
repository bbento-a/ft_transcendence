"use client";
import styles from "./page.module.css"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import GameroomWidget from "../components/gameroomWidget"
import GamePopUp from "../components/gamePopUp"
import useClickOutside from "../hooks/useClickOutside"
import RequireAuth from "../components/requireAuth"
import { useGameSocket } from "../hooks/useGameSocket"

export default function Home() {
	const [toggled, setToggle] = useState(false);
	const popupRef = useRef<HTMLDivElement>(null);
	const router = useRouter();

	const { rooms, connected, getRooms, createRoom, createdRoomId, resumeRoomId } = useGameSocket();

	useClickOutside([popupRef], () => setToggle(false), toggled);

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
			rooms.length === 0 &&
			<div className={styles.textWrapper}>
				<div className={styles.noGameRooms}>No game rooms available at the moment!</div>
			</div>
		}
		{rooms.map((room) => (
			<GameroomWidget
				key={room.id}
				room={room}
				onEnter={(roomId) => router.push(`/${roomId}`)}
			/>
		))}

		</div>
		<div ref={popupRef} className={styles.buttonWrapper}>
			{ toggled && <GamePopUp onPlayVsSomeone={createRoom}></GamePopUp>}
			<button onClick={() => {setToggle(!toggled)}} className={styles.buttonWrapper}>
				<Image className={styles.gameroomIcon} width={70} height={70} sizes="100vw" alt="" src="/gameroom.svg"/>
			</button>
		</div>
	</div>
	</RequireAuth>
  )
}

"use client";
import styles from "./page.module.css"
import Image from "next/image"
import { useRef, useState } from "react"

import GameroomWidget from "../components/gameroomWidget"
import GamePopUp from "../components/gamePopUp"
import useClickOutside from "../hooks/useClickOutside"

export default function Home() {
	const [toggled, setToggle] = useState(false);
	const popupRef = useRef<HTMLDivElement>(null);
	let gamerooms = 4;

	useClickOutside([popupRef], () => setToggle(false), toggled);

  return (
	<div className={styles.pageWrapper}>
		<div className={styles.wrapperScroll}>


		{
			gamerooms == 0 &&
			<div className={styles.textWrapper}>
				<div className={styles.noGameRooms}>No game rooms available at the moment!</div>
			</div>
		}
		{
			gamerooms >= 1 &&
			<GameroomWidget></GameroomWidget>
		}
		{
			gamerooms >= 2 &&
			<GameroomWidget></GameroomWidget>
		}
		{
			gamerooms >= 3 &&
			<GameroomWidget></GameroomWidget>
		}
		{
			gamerooms >= 4 &&
			<GameroomWidget></GameroomWidget>
		}
		{
			gamerooms >= 5 &&
			<GameroomWidget></GameroomWidget>
		}
		{/* ^^^ this is just for testing ^^^ */}

		</div>
		<div ref={popupRef} className={styles.buttonWrapper}>
			{ toggled && <GamePopUp></GamePopUp>}
			<button onClick={() => {setToggle(!toggled)}} className={styles.buttonWrapper}>
				<Image className={styles.gameroomIcon} width={70} height={70} sizes="100vw" alt="" src="/gameroom.svg"/>
			</button>
		</div>
	</div>
  )
}

// "use client";
import styles from "./page.module.css"
import Image from "next/image"

import GameroomWidget from "../components/gameroomWidget";

export default function Home() {
	let gamerooms = 4;

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
			<div className={styles.buttonWrapper}>
				<Image className={styles.gameroomIcon} width={70} height={70} sizes="100vw" alt="" src="/gameroom.svg"/>
			</div>
	</div>
  )
}

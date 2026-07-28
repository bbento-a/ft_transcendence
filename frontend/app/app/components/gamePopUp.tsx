"use client";
import styles from "./css_modules/gamePopUp.module.css"
import { useRouter } from "next/navigation"

export default function gamePopUp() {
  const router = useRouter();

  // The route segment carries the mode: /ai -> vs bot, /match -> matchmaking.
  // The game page reads it and starts the matching game on connect.
  return (
	<div className={styles.popup}>
			<div className={styles.buttonWrapper}>
				<button className={styles.button} onClick={() => router.push("/ai")}>
					<div className={styles.text}>Play vs bot</div>
				</button>
				<button className={styles.button} onClick={() => router.push("/match")}>
					<div className={styles.text}>Play vs someone</div>
				</button>
			</div>
		</div>
  )
}

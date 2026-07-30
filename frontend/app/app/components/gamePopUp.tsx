"use client";
import styles from "./css_modules/gamePopUp.module.css"
import { useRouter } from "next/navigation"

// "Play vs bot" goes straight to the /ai route, which starts a private game.
// "Play vs someone" opens a room instead: the lobby creates it and then sends
// the host into it, so the URL is the real room id from the start.
export default function gamePopUp({ onPlayVsSomeone }: { onPlayVsSomeone: () => void }) {
  const router = useRouter();

  return (
	<div className={styles.popup}>
			<div className={styles.buttonWrapper}>
				<button className={styles.button} onClick={() => router.push("/ai")}>
					<div className={styles.text}>Play vs bot</div>
				</button>
				<button className={styles.button} onClick={onPlayVsSomeone}>
					<div className={styles.text}>Play vs someone</div>
				</button>
			</div>
		</div>
  )
}

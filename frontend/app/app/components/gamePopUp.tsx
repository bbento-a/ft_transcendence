"use client";
import styles from "./css_modules/gamePopUp.module.css"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl";


// "Play vs bot" goes straight to the /ai route, which starts a private game.
// "Play vs someone" opens a room instead: the lobby creates it and then sends
// the host into it, so the URL is the real room id from the start.
export default function gamePopUp({ onPlayVsSomeone }: { onPlayVsSomeone: () => void }) {
  const router = useRouter();

  const t = useTranslations("gamerooms");

  return (
	<div className={styles.popup}>
			<div className={styles.buttonWrapper}>
				<button className={styles.button} onClick={() => router.push("/ai")}>
					<div className={styles.text}>{t("playvsbot")}</div>
				</button>
				<button className={styles.button} onClick={onPlayVsSomeone}>
					<div className={styles.text}>{t("playvsplayer")}</div>
				</button>
			</div>
		</div>
  )
}

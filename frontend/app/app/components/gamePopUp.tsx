"use client";
import styles from "./css_modules/gamePopUp.module.css"
import { useTranslations } from "next-intl";


// "Play vs bot" starts a private game on the /ai route. "Play vs someone"
// opens a room instead: the lobby creates it and then sends the host into it,
// so the URL is the real room id from the start. Both navigations belong to
// the lobby (it shows the room-transition overlay), so this popup only tells
// it which button was pressed.
export default function gamePopUp({
	onPlayVsSomeone,
	onPlayVsBot,
}: {
	onPlayVsSomeone: () => void;
	onPlayVsBot: () => void;
}) {
  const t = useTranslations("gamerooms");

  return (
	<div className={styles.popup}>
			<div className={styles.buttonWrapper}>
				<button className={styles.button} onClick={onPlayVsBot}>
					<div className={styles.text}>{t("playvsbot")}</div>
				</button>
				<button className={styles.button} onClick={onPlayVsSomeone}>
					<div className={styles.text}>{t("playvsplayer")}</div>
				</button>
			</div>
		</div>
  )
}

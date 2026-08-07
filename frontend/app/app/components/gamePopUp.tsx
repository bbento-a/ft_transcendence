"use client";
import styles from "./css_modules/gamePopUp.module.css"
import { useTranslations } from "next-intl";


// "Play vs bot" starts a private game on the /ai route. "Play vs someone"
// opens a room instead: the lobby creates it and then sends the host into it,
// so the URL is the real room id from the start. This popup only tells the
// lobby which button was pressed.
//
// `creating` e a espera do createRoom: a viagem ao servidor acontece antes de
// qualquer navegacao, por isso e o botao que mostra o spinner e tranca para
// nao criar duas salas com cliques repetidos.
export default function gamePopUp({
	onPlayVsSomeone,
	onPlayVsBot,
	creating = false,
}: {
	onPlayVsSomeone: () => void;
	onPlayVsBot: () => void;
	creating?: boolean;
}) {
  const t = useTranslations("gamerooms");
  // texto que so os leitores de ecra veem, ver namespace a11y
  const tA11y = useTranslations("a11y");

  return (
	<div className={styles.popup}>
			<div className={styles.buttonWrapper}>
				<button className={styles.button} onClick={onPlayVsBot}>
					<div className={styles.text}>{t("playvsbot")}</div>
				</button>
				<button className={styles.button} onClick={onPlayVsSomeone} disabled={creating}>
					{
						creating
						? <div className={styles.buttonSpinner} aria-label={tA11y("loading")} />
						: <div className={styles.text}>{t("playvsplayer")}</div>
					}
				</button>
			</div>
		</div>
  )
}

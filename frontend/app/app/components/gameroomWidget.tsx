import styles from "./css_modules/gameroomWidget.module.css"
import type { RoomSummary } from "../types/game"
import { useTranslations } from "next-intl";

// One room box: host on the left, opponent on the right (blank while waiting).
// Waiting room -> the button joins you as the opponent.
// Full room    -> the button takes you in as a spectator.
export default function gameroomWidget({
	room,
	onEnter,
}: {
	room: RoomSummary;
	onEnter: (roomId: string) => void;
}) {
	const t = useTranslations("gameroomsWidget");
  return (
	<div className={styles.roomWidget}>
		<div className={styles.contentWrapper}>
			<div className={styles.frameGroup}>
				<div className={styles.playerWrapper}>
					<div className={styles.player}>{room.hostName}</div>
				</div>
				<div className={styles.vs}>vs</div>
				<div className={styles.playerWrapper}>
					<div className={styles.player}>{room.guestName ?? "....."}</div>
				</div>
			</div>
			<button className={styles.button} onClick={() => onEnter(room.id)}>
				<div className={styles.text}>
					{room.status === t("Waiting") ? t("Join") : t("Spectate")}
				</div>
			</button>
		</div>
	</div>
  )
}

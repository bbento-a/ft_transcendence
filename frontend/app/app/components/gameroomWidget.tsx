import styles from "./css_modules/gameroomWidget.module.css"

export default function gameroomWidget() {
	// implement if has a player waiting -> button join
	// if match ongoing -> button spectate
  return (
	<div className={styles.roomWidget}>
		<div className={styles.contentWrapper}>
			<div className={styles.frameGroup}>
				<div className={styles.playerWrapper}>
					<div className={styles.player}>Player</div>
				</div>
				<div className={styles.vs}>vs</div>
				<div className={styles.playerWrapper}>
					<div className={styles.player}>Player</div>
				</div>
			</div>
			<button className={styles.button}>
				<div className={styles.text}>Text</div>
			</button>
		</div>
	</div>
  )
}

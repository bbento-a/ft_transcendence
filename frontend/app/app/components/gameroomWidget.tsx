import styles from "./css_modules/gameroomWidget.module.css"

export default function gameroomWidget() {
  return (
	<div className={styles.roomWidget}>
			<div className={styles.frameParent}>
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

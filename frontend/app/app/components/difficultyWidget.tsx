import styles from "./css_modules/difficultyWidget.module.css"

export default function difficultyWidget() {
  return (
	<div className={styles.difficultyWidget}>
		<div className={styles.text}>Difficulty</div>
		<div className={styles.buttonWrapper}>
			<button className={styles.button}>
				<div className={styles.difMeter} />
			</button>
			<button className={styles.button}>
				<div className={styles.difMeter} />
				<div className={styles.difMeter} />
			</button>
			<button className={styles.button}>
				<div className={styles.difMeter} />
				<div className={styles.difMeter} />
				<div className={styles.difMeter} />
			</button>
		</div>
	</div>
  )
}

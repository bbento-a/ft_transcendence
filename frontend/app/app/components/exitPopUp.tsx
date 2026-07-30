import styles from "./css_modules/exitPopUp.module.css"

export default function exitPopUp() {
  return (
	<div className={styles.widgetWrapper}>
		<div className={styles.textWrapper}>
			<div className={styles.title}>Are you sure you want to leave?</div>
			<div className={styles.subtitle}>Leaving during a match will be considered as forfeiting the current game</div>
		</div>
			<div className={styles.buttonWrapper}>
			<button className={styles.button}>
				<div className={styles.text}>Stay</div>
			</button>
			<button className={styles.buttonDark}>
				<div className={styles.text}>Leave</div>
			</button>
		</div>
	</div>
  )
}

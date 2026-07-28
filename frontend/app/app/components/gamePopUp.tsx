import styles from "./css_modules/gamePopUp.module.css"

export default function gamePopUp() {
  return (
	<div className={styles.popup}>
			<div className={styles.buttonWrapper}>
				<button className={styles.button}>
					<div className={styles.text}>Play vs bot</div>
				</button>
				<button className={styles.button}>
					<div className={styles.text}>Play vs someone</div>
				</button>
			</div>
		</div>
  )
}

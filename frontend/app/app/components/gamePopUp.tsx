import styles from "./css_modules/gamePopUp.module.css"

export default function gamePopUp() {
  return (
	<div className={styles.popup}>
			<div className={styles.buttonWrapper}>
				<div className={styles.button}>
					<div className={styles.text}>Play vs bot</div>
				</div>
				<div className={styles.button}>
					<div className={styles.text}>Play vs someone</div>
				</div>
			</div>
		</div>
  )
}

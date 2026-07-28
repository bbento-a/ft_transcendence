
import styles from "./css_modules/lgsWidget.module.css"

export default function languagesWidget() {
  return (
	<div className={styles.languagesWidget}>
			<div className={styles.buttonWrapper}>
				<button className={styles.button}>
					<div className={styles.text}>English</div>
				</button>
				<button className={styles.button}>
					<div className={styles.text}>Português</div>
				</button>
				<button className={styles.button}>
					<div className={styles.text}>Deutsch</div>
				</button>
			</div>
		</div>
	)
}

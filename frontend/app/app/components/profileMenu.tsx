import styles from "./css_modules/profileMenu.module.css"

export default function profileMenu()
{
	return(
		<div className={styles.profileWidget}>
			<div className={styles.textWrapper}>
				<div className={styles.header}>Name</div>
			</div>
			<div className={styles.buttonWrapper}>
				<button className={styles.button}>
					<div className={styles.text}>Settings</div>
				</button>
				<button className={styles.buttonDark}>
					<div className={styles.text}>Log Out</div>
				</button>
			</div>
		</div>
	)
}

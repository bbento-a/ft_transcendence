import styles from "./css_modules/footer.module.css"

export default function footer() {
  return (
	<footer>
		<div className={styles.footerWrapper}>
			<div className={styles.footerContent}>
				<div className={styles.footerTexts}>Terms of Conditions</div>
				<div className={styles.footerTexts}>Privacy Policy</div>
			</div>
		</div>
	</footer>
  )
}

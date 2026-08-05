import styles from "./css_modules/exitPopUp.module.css"

// Confirmation shown when someone tries to walk out of a live match (back
// button or the wawa icon). The page decides what "Stay" and "Leave" do; this
// component only draws the question.
export default function exitPopUp({
	onStay,
	onLeave,
}: {
	onStay: () => void;
	onLeave: () => void;
}) {
  return (
	<div className={styles.widgetWrapper}>
		<div className={styles.textWrapper}>
			<div className={styles.title}>Are you sure you want to leave?</div>
			<div className={styles.subtitle}>Leaving during a match will be considered as forfeiting the current game</div>
		</div>
			<div className={styles.buttonWrapper}>
			<button className={styles.button} onClick={onStay}>
				<div className={styles.text}>Stay</div>
			</button>
			<button className={styles.buttonDark} onClick={onLeave}>
				<div className={styles.text}>Leave</div>
			</button>
		</div>
	</div>
  )
}

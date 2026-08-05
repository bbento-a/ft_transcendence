import styles from "./css_modules/exitPopUp.module.css"
import { useTranslations } from "next-intl";

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
	const t = useTranslations("exitPopUp");
  return (
	<div className={styles.widgetWrapper}>
		<div className={styles.textWrapper}>
			<div className={styles.title}>{t("title")}?</div>
			<div className={styles.subtitle}>{t("description")}</div>
		</div>
			<div className={styles.buttonWrapper}>
			<button className={styles.button} onClick={onStay}>
				<div className={styles.text}>{t("stay")}</div>
			</button>
			<button className={styles.buttonDark} onClick={onLeave}>
				<div className={styles.text}>{t("leave")}</div>
			</button>
		</div>
	</div>
  )
}

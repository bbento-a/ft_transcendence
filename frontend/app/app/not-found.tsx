import styles from "./not-found.module.css";
import BackArrow from "./components/backArrow";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
    const t = useTranslations("404");

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.contentWrapper}>
        <div className={styles.termsTexts}>
          <h1>404</h1>
            <p>{t("message")}</p>
            <Link href="/">{t("home")}</Link>
        </div>
      </div>
    </div>
  );
}

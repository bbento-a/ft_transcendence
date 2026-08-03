import styles from "./css_modules/footer.module.css";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function Footer() {
  const t = useTranslations("footer");

  return (
    <footer>
      <div className={styles.footerWrapper}>
        <div className={styles.footerContent}>
            <div className={styles.footerTexts}>
              <Link href="/terms"><b>{t("terms")}</b></Link>
            </div>
          <div className={styles.footerTexts}>
              <Link href="/privacy"><b>{t("privacyPolicy")}</b></Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
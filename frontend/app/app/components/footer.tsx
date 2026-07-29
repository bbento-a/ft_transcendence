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
              <Link href="/terms"><u><b>{t("terms")}</b></u></Link>
            </div>
          <div className={styles.footerTexts}>
              <Link href="/privacy"><u><b>{t("privacyPolicy")}</b></u></Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
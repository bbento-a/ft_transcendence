"use client"

import Image from 'next/image'
import styles from "./page.module.css";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function PrivacyPolicy() {
  const t = useTranslations("privacyPolicy");

  const sections = [
    "intro",
    "controller",
    "data",
    "use",
    "legalBasis",
    "cookies",
    "retention",
    "sharing",
    "rights",
    "security",
    "changes",
  ] as const;

  const router = useRouter();

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.contentWrapper}>
        <div className={styles.termsTexts}>
          <h1>{t("title")}</h1>
          <p>{t("lastUpdated")}</p>

          {sections.map((key) => (
            <section key={key}>
              <h2>{t(`sections.${key}.title`)}</h2>
              <p>{t(`sections.${key}.body`)}</p>
            </section>
          ))}
        </div>
      </div>
      <div className={styles.buttonWrapper}>
				<button onClick={() => {router.back()}}>
					<Image width={30} height={30} sizes="100vw" alt="" src={"/arrow.svg"}></Image>
				</button>
			</div>
    </div>
  );
}
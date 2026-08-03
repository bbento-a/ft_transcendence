"use client"

import styles from "./page.module.css";
import Image from 'next/image'
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function Terms() {
  const t = useTranslations("terms");

  const sections = [
    "acceptance",
    "use",
    "accounts",
    "content",
    "ip",
    "prohibited",
    "termination",
    "disclaimer",
    "liability",
    "changes",
    "law",
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
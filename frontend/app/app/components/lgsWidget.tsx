"use client";

import styles from "./css_modules/lgsWidget.module.css";
import { useRouter } from "next/navigation";
import { forwardRef } from "react";

const LanguagesWidget = forwardRef<HTMLDivElement>((_, ref) => {
  const router = useRouter();

  const changeLanguage = (locale: string) => {
    document.cookie = `locale=${locale}; path=/`;
    router.refresh();
  };

  return (
    <div ref={ref} className={styles.languagesWidget}>
      <div className={styles.buttonWrapper}>
        <button
          className={styles.button}
          onClick={() => changeLanguage("en")}
          type="button"
        >
          <div className={styles.text}>English</div>
        </button>

        <button
          className={styles.button}
          onClick={() => changeLanguage("pt")}
          type="button"
        >
          <div className={styles.text}>Português</div>
        </button>

        <button
          className={styles.button}
          onClick={() => changeLanguage("de")}
          type="button"
        >
          <div className={styles.text}>Deutsch</div>
        </button>
      </div>
    </div>
  );
});

LanguagesWidget.displayName = "LanguagesWidget";

export default LanguagesWidget;
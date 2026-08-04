"use client";
import styles from "./css_modules/difficultyWidget.module.css"
import { useTranslations } from "next-intl";

import { DIFFICULTIES, Difficulty } from "../types/game";

// Escolha do nivel do bot: 1, 2 ou 3 bolinhas = easy, medium, hard. Quem abre
// isto e o "Play vs bot" do popup; escolher um nivel comeca logo o jogo, por
// isso nao ha estado selecionado — o botao E a confirmacao.
export default function DifficultyWidget({
	onSelect,
}: {
	onSelect: (difficulty: Difficulty) => void;
}) {
  const t = useTranslations("gamerooms");

  return (
	<div className={styles.difficultyWidget}>
		<div className={styles.text}>{t("difficulty")}</div>
		<div className={styles.buttonWrapper}>
			{DIFFICULTIES.map((level, i) => (
				<button
					key={level}
					className={styles.button}
					aria-label={level}
					title={level}
					onClick={() => onSelect(level)}
				>
					{Array.from({ length: i + 1 }, (_, dot) => (
						<div key={dot} className={styles.difMeter} />
					))}
				</button>
			))}
		</div>
	</div>
  )
}

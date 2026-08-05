"use client";
import Image from "next/image"
import { useRouter } from "next/navigation";
import styles from "./css_modules/backArrow.module.css"

/*
	Seta de voltar atras, partilhada por varias paginas.

	Por omissao faz router.back(), que serve para paginas normais (settings,
	terms, privacy, dashboard). Quem precisa de fazer algo antes de sair passa
	o seu proprio onClick -- e o caso do jogo, que tem de avisar o servidor
	(leaveRoom) e, a meio de uma partida, pedir confirmacao primeiro.

	disabled evita cliques repetidos enquanto uma saida ja esta a decorrer.
*/
export default function backArrow({
	onClick,
	disabled,
}: {
	onClick?: () => void;
	disabled?: boolean;
} = {}) {
	const router = useRouter();

	return (
		<button
			className={styles.backButton}
			onClick={onClick ?? (() => {router.back()})}
			disabled={disabled}
		>
			<Image width="0" height="0" sizes="100vw" alt="" src={"/arrow.svg"} className={styles.fixSize}></Image>
		</button>
  )
}

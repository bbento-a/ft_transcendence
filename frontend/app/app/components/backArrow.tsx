"use client";
import Image from "next/image"
import { useRouter } from "next/navigation";
import styles from "./css_modules/backArrow.module.css"

export default function backArrow() {
	const router = useRouter();

	return (
		<button className={styles.backButton} onClick={() => {router.back()}}>
			<Image width="0" height="0" sizes="100vw" alt="" src={"/arrow.svg"} className={styles.fixSize}></Image>
		</button>
  )
}

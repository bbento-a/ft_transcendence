import Image from "next/image"
import styles from "./page.module.css"

import CreateAccount from "../components/create_acc"

export default function login() {
  return (
	<div className={styles.pageWrapper}>
		<div className={styles.contentWrapper}>
			<Image className={styles.frameIcon} width={483} height={116} sizes="100vw" alt="" src="/wawaLogo.svg"/>
		</div>
		<CreateAccount></CreateAccount>
	</div>
  )
}

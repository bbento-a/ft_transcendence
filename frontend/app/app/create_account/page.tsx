import Image from "next/image"
import styles from "./page.module.css"

import CreateAccount from "../components/create_acc"

export default function login() {
  return (
	<div className={styles.pageWrapper}>
		<Image className={styles.frameIcon} width="0" height="0" sizes="100vw" alt="" src="/wawaLogo.svg"/>
		<CreateAccount></CreateAccount>
	</div>
  )
}

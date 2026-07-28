import Image from "next/image"
import styles from "./page.module.css"

import Login from "../components/login"

export default function login() {
  return (
	<div className={styles.pageWrapper}>
		<Image className={styles.frameIcon} width={483} height={116} sizes="100vw" alt="" src="/wawaLogo.svg"/>
		<Login></Login>
	</div>
  )
}

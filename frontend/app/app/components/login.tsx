import Image from "next/image"
import styles from "./css_modules/login.module.css"
import Link from "next/link"

export default function login() {
  return (
	<div className={styles.logInWidget}>
		<div className={styles.mainText}>
			<div className={styles.title}>Log in</div>
			<div className={styles.description}>Enter with your account to start playing!</div>
		</div>
		<div>
			<form action="" className={styles.loginForm}>
				<input className={styles.button} type="email" placeholder="Email"/>
				<input className={styles.button} type="password" placeholder="Password"/>
				<button className={styles.buttonDark} type="submit">Enter</button>
			</form>
		</div>
		<div className={styles.authText}>
			<div className={styles.text}>or log through</div>
		</div>
			<div className={styles.auths}>
				<button className={styles.buttonAuth}>
					<Image width={60} height={60} sizes="100vw" alt="" src="/42Logo.svg" />
				</button>
				<button className={styles.buttonAuth}>
					<Image width={40} height={40} sizes="100vw" alt="" src="/googleLogo.svg"/>
				</button>
			</div>
			<div className={styles.authText}>
				<div className={styles.text}>No account yet? Create an account <Link href="/create_account" color="#ffffff"><u><b>here</b></u></Link></div>
			</div>
	</div>
  )
}

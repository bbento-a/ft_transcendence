import styles from "./css_modules/create_acc.module.css"
import Image from "next/image"
import Link from "next/link"

export default function create_acc() {
  return (
		<div className={styles.createAccWidget}>
		<div className={styles.mainText}>
			<div className={styles.title}>Create account</div>
			<div className={styles.description}>Create an account and log in to start playing!</div>
		</div>
		<div>
			<form action="" className={styles.form}>
				<input className={styles.button} type="username" placeholder="Username"/>
				<input className={styles.button} type="email" placeholder="Email"/>
				<input className={styles.button} type="password" placeholder="Password"/>
				<button className={styles.buttonDark} type="submit">Enter</button>
			</form>
		</div>
		<div className={styles.authText}>
			<div className={styles.text}>or create through</div>
		</div>
			<div className={styles.auths}>
				<button className={styles.buttonAuth}>
					<Image width={78} height={78} sizes="100vw" alt="" src="/42Logo.svg" />
				</button>
				<button className={styles.buttonAuth}>
					<Image width={50} height={50} sizes="100vw" alt="" src="/googleLogo.svg"/>
				</button>
			</div>
			<div className={styles.authText}>
				<div className={styles.text}>Already have an account? Log in <Link href="/log_in" color="#ffffff"><u><b>here</b></u></Link></div>
			</div>
	</div>
  )
}

import styles from "./page.module.css"
import Image from 'next/image'

export default function page() {  
  return (  
  <div className={styles.pageWrapper}>
		<div className={styles.pageGroup}>
        	<div className={styles.profileGroup}>
			    <Image className={styles.profileIcon} width={150} height={150} sizes="100vw" alt="" src="/profileDark.svg"></Image>
				<button className={styles.buttonProfile}>
					<div className={styles.buttonText}>Change Profile Image</div>
				</button>
			</div>

			<div className={styles.infoGroup}>
				<div className={styles.info}>
					<div className={styles.fieldDescription}>Username:
						<div className={styles.fieldInfo}>Wawazada1234</div>
					</div>
				</div>
				<div className={styles.info}>
					<div className={styles.fieldDescription}>Email:
						<div className={styles.fieldInfo}>Wawawawawawaawawa@wawaaa.com</div>
					</div>
				</div>
			</div>
		</div>
			<div className={styles.pageGroup}>
				<div className={styles.formGroup}>
					<form action=""className={styles.formGroup}>
						<div className={styles.formDescription}>Change Username:</div>
						<input className={styles.formField} type="user" placeholder="New Username"/>
						<div className={styles.formDescription}>Change Email:</div>
						<input className={styles.formField} type="email" placeholder="New Email"/>
						<div className={styles.formDescription}>New Password:</div>
						<input className={styles.formField} type="email" placeholder="New Password"/>
						<div className={styles.formDescription}>Confirm Password:</div>
						<input className={styles.formField} type="email" placeholder="Confirm Password"/>
							<button className={styles.confirmButton} type="submit">
								<div className={styles.buttonText}>Save Changes</div>
							</button>
					</form>
				</div>
			</div>
		</div>
  )
}
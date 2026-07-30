"use client";

import styles from "./page.module.css"
import { useTranslations } from "next-intl";
import { useUser } from "@/context/AuthContext";



export default function page() {  
	const t = useTranslations("settings");

	const { user } = useUser();
	
	

  	return (  
  	<div className={styles.pageWrapper}>
		<div className={styles.pageGroup}>
        	<div className={styles.profileGroup}>
			    <img
					className={styles.profilePic}
					src={user?.avatarUrl || "/profile.svg"}
					alt="Profile picture"
					width={250}
					height={250}
				/>
				<button className={styles.buttonProfile}>
					<div className={styles.buttonText}>{t("changepfp")}</div>
				</button>
			</div>

			<div className={styles.infoGroup}>
				<div className={styles.info}>
					<div className={styles.fieldDescription}>{t("username")}
						<div className={styles.fieldInfo}>Wawazada1234</div>
					</div>
				</div>
				<div className={styles.info}>
					<div className={styles.fieldDescription}>{t("email")}
						<div className={styles.fieldInfo}>Wawawawawawaawawa@wawaaa.com</div>
					</div>
				</div>
			</div>
		</div>
			<div className={styles.pageGroup}>
				<div className={styles.formGroup}>
					<form action=""className={styles.formGroup}>
						<div className={styles.formDescription}>{t("changeusername")}</div>
						<input className={styles.formField} type="user" placeholder={t("newusername")}/>
						<div className={styles.formDescription}>{t("changeemail")}</div>
						<input className={styles.formField} type="email" placeholder={t("newemail")}/>
						<div className={styles.formDescription}>{t("changepassword")}</div>
						<input className={styles.formField} type="email" placeholder={t("newpassword")}/>
						<div className={styles.formDescription}>{t("confirmpassword")}</div>
						<input className={styles.formField} type="email" placeholder={t("newpassword")}/>
							<button className={styles.confirmButton} type="submit">
								<div className={styles.buttonText}>{t("save")}</div>
							</button>
					</form>
				</div>
			</div>
		</div>
	)
}
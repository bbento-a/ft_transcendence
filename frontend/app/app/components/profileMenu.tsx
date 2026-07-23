"use client";

import styles from "./css_modules/profileMenu.module.css"
import { useRouter } from "next/navigation";
import { useUser } from "@/context/AuthContext";

export default function profileMenu()
{
	const { user, logout } = useUser();
	const router = useRouter();

	const handleLogout = async () => {
		await logout();
		router.push("/log_in");
	}

	return(
		<div className={styles.profileWidget}>
			<div className={styles.textWrapper}>
				<div className={styles.header}>{user?.username}</div>
			</div>
			<div className={styles.buttonWrapper}>
				<button className={styles.button}>
					<div className={styles.text}>Settings</div>
				</button>
				<button className={styles.buttonDark} onClick={handleLogout}>
					<div className={styles.text}>Log Out</div>
				</button>
			</div>
		</div>
	)
}

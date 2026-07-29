"use client";

import type { Ref } from "react";
import styles from "./css_modules/profileMenu.module.css"
import { useRouter } from "next/navigation";
import { useUser } from "@/context/AuthContext";
import { useTranslations } from "next-intl";

export default function profileMenu({ ref, onClose }: { ref?: Ref<HTMLDivElement>; onClose?: () => void })
{
	const t = useTranslations("profile");

	const { user, logout } = useUser();
	const router = useRouter();

	const handleLogout = async () => {
		await logout();
		router.push("/log_in");
	}
	const routerSettings = async () => {
		onClose?.();
		router.push("/settings");
	}

	return(
		<div ref={ref} className={styles.profileWidget}>
			<div className={styles.textWrapper}>
				<div className={styles.header}>{user?.username}</div>
			</div>
			<div className={styles.buttonWrapper}>
				<button className={styles.button} onClick={routerSettings}>
					<div className={styles.text}>{t("settings")}</div>
				</button>
				<button className={styles.buttonDark} onClick={handleLogout}>
					<div className={styles.text}>{t("logout")}</div>
				</button>
			</div>
		</div>
	)
}

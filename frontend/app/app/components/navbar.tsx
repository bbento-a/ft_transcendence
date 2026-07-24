"use client";

import Image from "next/image";
import styles from "./css_modules/navbar.module.css"
import { useState } from 'react';

import LanguagesWidget from "./lgsWidget";
import ProfileMenu from "./profileMenu";

export default function NavBar()
{
	const [logged, setDisplayLog] = useState(true); // connect w backend by fetch tokens (I think)

	const [openMenu, setOpenMenu] = useState<"lang" | "prof" | null>(null);
	const toggleLang = openMenu === "lang";
	const toggleProf = openMenu === "prof";
	
	return (
		<nav>
		<div className={styles.navBarWrapper}>
			<div className={styles.leftWrapper}>
				<div className={styles.wawaIcon}>
					<Image className={styles.wawaIcon} width={60 * 4} height={60} sizes="100vw" alt="" src="/wawaIcon.svg" />
				</div>
				<div className={styles.wawaText}>wawa</div>
			</div>
			<div className={styles.rightWrapper}>
					<button onClick={() => setOpenMenu(toggleLang ? null : "lang")} className={styles.buttonIcon}>
						<Image className={styles.imageIcon} width={50} height={50} sizes="100vw" alt="" src="/languages.svg"/>
					</button>
					{toggleLang && <LanguagesWidget></LanguagesWidget>}
					{
						logged &&
							<button onClick={() => setOpenMenu(toggleProf ? null : "prof")} className={styles.buttonIcon}>
								<Image className={styles.imageIcon} width={50} height={50} sizes="100vw" alt="" src="/profile.svg"/>
							</button>
					}
					{toggleProf && <ProfileMenu></ProfileMenu>}

			</div>
		</div>
        </nav>
	)

}


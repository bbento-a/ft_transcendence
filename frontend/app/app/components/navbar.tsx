"use client";

import Image from "next/image";
import styles from "./css_modules/navbar.module.css"
import { useState } from 'react';

import LanguagesWidget from "./lgsWidget";
import ProfileMenu from "./profileMenu";

export default function NavBar()
{
	const [toggled, setToggle] = useState(false);
	const [logged, setDisplayLog] = useState(false); // connect w backend by fetch tokens (I think)
	const [profMenu, setProfMenu] = useState(false); // for profile menu

	
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
					<button onClick={() => setToggle(!toggled)} className={styles.buttonIcon}>
						<Image className={styles.languagesIcon} width={50} height={50} sizes="100vw" alt="" src="/languages.svg"/>
					</button>
					{toggled && <LanguagesWidget></LanguagesWidget>}
					{
						logged &&
							<button onClick={() => setProfMenu(!profMenu)} className={styles.buttonIcon}>
								<Image className={styles.languagesIcon} width={50} height={50} sizes="100vw" alt="" src="/profile.svg"/>
							</button>
					}
					{profMenu && <ProfileMenu></ProfileMenu>}

			</div>
		</div>
        </nav>
	)

}


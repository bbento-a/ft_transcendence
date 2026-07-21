"use client";

import Image from "next/image";
import styles from "./css_modules/navbar.module.css"
import { useState } from 'react';

import LanguagesWidget from "./lgsWidget";
import ProfileMenu from "./profileMenu";

export default function NavBar()
{

	/*
		Chat sejam bem vindos ao fix de hoje !!
		Ent Pelos visto use state pode ter mais que um valor bue nice néé, o fixe disto e que ele so pode conter um 
		valor de cada vez na mesma ent se ele for language nao pode ser profile

		Inicialmente ele começa como nulo e depois vamos verificar o valor dele GG Sigam-me para mais tutoriais como este
		Podem tambem deixar like, sub no canal e dizer o quao incrivel eu sou nos comentarios.
		Peace
	*/

	const [openMenu, setOpenMenu] = useState<"lang" | "profile" | null>(null);
	const [logged, setDisplayLog] = useState(true); // connect w backend by fetch tokens (I think)

	const toggled = openMenu === "lang";
	const profMenu = openMenu === "profile";

	
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
					<button onClick={() => setOpenMenu(toggled ? null : "lang")} className={styles.buttonIcon}>
						<Image className={styles.languagesIcon} width={50} height={50} sizes="100vw" alt="" src="/languages.svg"/>
					</button>
					{toggled && <LanguagesWidget></LanguagesWidget>}
					{
						logged &&
							<button onClick={() => setOpenMenu(profMenu ? null : "profile")} className={styles.buttonIcon}>
								<Image className={styles.languagesIcon} width={50} height={50} sizes="100vw" alt="" src="/profile.svg"/>
							</button>
					}
					{profMenu && <ProfileMenu></ProfileMenu>}

			</div>
		</div>
        </nav>
	)

}


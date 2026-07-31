"use client";

import Image from "next/image";
import styles from "./css_modules/navbar.module.css"
import { useEffect, useRef, useState } from 'react';
import { useUser } from "@/context/AuthContext";
import useClickOutside from "../hooks/useClickOutside";
import Link from "next/link";

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
	const { user } = useUser();
	const logged = !!user;
	
	const toggled = openMenu === "lang";
	const profMenu = openMenu === "profile";

	const langBtnRef = useRef<HTMLButtonElement>(null);
	const langMenuRef = useRef<HTMLDivElement>(null);
	const profBtnRef = useRef<HTMLButtonElement>(null);
	const profMenuRef = useRef<HTMLDivElement>(null);

	useClickOutside([langBtnRef, langMenuRef], () => setOpenMenu(null), toggled);
	useClickOutside([profBtnRef, profMenuRef], () => setOpenMenu(null), profMenu);

	// sem isto o menu de perfil ficava aberto depois do logout e aparecia na pagina de login
	useEffect(() => {
		if (!logged)
			setOpenMenu((open) => (open === "profile" ? null : open));
	}, [logged]);


	return (
		<nav>
		<div className={styles.navBarWrapper}>
			<div className={styles.leftWrapper}>
				<Link href="/" className={styles.wawaIcon}>
				  <Image
				    className={styles.wawaIcon}
				    width={60}
				    height={60}
				    sizes="100vw"
				    alt=""
				    src="/wawaIcon.svg"
				  />
				</Link>
				<Link href="/" className={styles.wawaText}>
				  wawa
				</Link>
			</div>
			<div className={styles.rightWrapper}>
				<button ref={langBtnRef} onClick={() => setOpenMenu(toggled ? null : "lang")} className={styles.buttonIcon}>
					<Image className={styles.languagesIcon} width={50} height={50} sizes="100vw" alt="" src="/languages.svg"/>
				</button>
				{toggled && <LanguagesWidget ref={langMenuRef}></LanguagesWidget>}
				{
					logged &&
						<button ref={profBtnRef} onClick={() => setOpenMenu(profMenu ? null : "profile")} className={styles.buttonIcon}>
							<img
								className={styles.profilePic}
								src={
								    user?.avatarUrl
								      : "/profile.svg"
								  }
								alt="Profile picture"
								width={50}
								height={50}
							/>
						</button>
				}
				{logged && profMenu && <ProfileMenu ref={profMenuRef} onClose={() => setOpenMenu(null)}></ProfileMenu>}
			</div>
		</div>
        </nav>
	)
}


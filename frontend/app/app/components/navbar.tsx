"use client";

import Image from "next/image";
import styles from "./css_modules/navbar.module.css"
import { useEffect, useRef, useState } from 'react';
import { usePathname } from "next/navigation";
import { useUser } from "@/context/AuthContext";
import { useTranslations } from "next-intl";
import useClickOutside from "../hooks/useClickOutside";
// O Link da next-view-transitions e o next/link com a navegacao embrulhada em
// view transition. Chama o nosso onClick primeiro e respeita preventDefault,
// por isso o guardedNav continua a mandar.
import { Link } from "next-view-transitions";

import LanguagesWidget from "./lgsWidget";
import ProfileMenu from "./profileMenu";
import { useNavGuard } from "@/context/NavGuardContext";

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
	// texto que so os leitores de ecra veem, ver namespace a11y
	const tA11y = useTranslations("a11y");
	const { user, loading } = useUser();
	const { guard } = useNavGuard();
	const pathname = usePathname();
	const logged = !!user;

	// O icone aponta DIRETO ao destino real em vez de "/" para todos: a pagina
	// "/" redireciona logados para /gamerooms no servidor, e essa segunda
	// navegacao rebentava a meio da view transition (o ecra ficava preso num
	// crossfade desfocado da pagina para ela propria).
	const homeHref = logged ? "/gamerooms" : "/";

	// O board de jogo pode registar um guard enquanto ha uma partida a decorrer.
	// Se ele intercetar o clique (true), fica com a decisao — mostra o popup de
	// confirmacao — e nos cancelamos a navegacao. Sem guard, o link e um link.
	// Ja estar no destino tambem cancela: transicionar uma pagina para ela
	// propria e so um pisca-pisca sem navegacao nenhuma.
	const guardedNav = (e: React.MouseEvent, href: string) => {
		if (pathname === href || (guard && guard(href)))
			e.preventDefault();
	};
	
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
				<Link href={homeHref} className={styles.wawaIcon} onClick={(e) => guardedNav(e, homeHref)}>
				  <Image
				    className={styles.wawaIcon}
				    width={60}
				    height={60}
				    sizes="100vw"
				    alt=""
				    src="/wawaIcon.svg"
				  />
				</Link>
				<Link href={homeHref} className={styles.wawaText} onClick={(e) => guardedNav(e, homeHref)}>
				  wawa
				</Link>
			</div>
			<div className={styles.rightWrapper}>
				<button ref={langBtnRef} onClick={() => setOpenMenu(toggled ? null : "lang")} className={styles.buttonIcon}>
					<Image className={styles.languagesIcon} width={50} height={50} sizes="100vw" alt="" src="/languages.svg"/>
				</button>
				{toggled && <LanguagesWidget ref={langMenuRef}></LanguagesWidget>}
				{
					// Enquanto o /me carrega mostramos um placeholder no lugar do
					// perfil, para o icone nao "saltar" quando o user aparece (F5).
					loading ? (
						<div
							className={`${styles.buttonIcon} ${styles.avatarPlaceholder}`}
							aria-hidden="true"
						/>
					) : logged ? (
						<button ref={profBtnRef} onClick={() => setOpenMenu(profMenu ? null : "profile")} className={styles.buttonIcon}>
							<img
								className={styles.profilePic}
								src={user?.avatarUrl ? user.avatarUrl : "/profile.svg"}
								alt={tA11y("profilePicture")}
								width={50}
								height={50}
							/>
						</button>
					) : null
				}
				{logged && profMenu && <ProfileMenu ref={profMenuRef} onClose={() => setOpenMenu(null)}></ProfileMenu>}
			</div>
		</div>
        </nav>
	)
}


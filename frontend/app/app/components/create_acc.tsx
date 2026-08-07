"use client";

import styles from "./css_modules/create_acc.module.css";
import Image from "next/image";
import { Link } from "next-view-transitions";
import React,{ useState ,ChangeEvent} from "react";
import { useTransitionRouter } from "next-view-transitions";
import { apiPost } from "../lib/api";
import { EMPTY_USERNAME, EMPTY_EMAIL, EMPTY_PASSWORD, GENERIC_ERROR, ErrorKey, ErrorName, firstEmptyField, pickError } from "../lib/formErrors";
import { useUser } from "@/context/AuthContext";
import { useTranslations } from "next-intl";

const loginGoogle = () => {
    window.location.assign("/api/auth/google");
};

const login42 = () => {
    window.location.assign("/api/auth/42");
};

/*
Ordem por que os erros do backend sao mostrados, um de cada vez em vez de todos
juntos: campos vazios primeiro (de cima para baixo do form), depois as regras de
cada campo e por fim os conflitos (409). Ganha o primeiro que der match.
*/
const ERROR_ORDER: ErrorName[] = [
	// o servidor nem respondeu, nao ha nada a dizer sobre os campos
	"offline",
	"usernameEmpty",
	"passwordEmpty",
	"usernameMin",
	"usernameMax",
	"usernamePattern",
	"emailInvalid",
	"passwordMin",
	"passwordMax",
	"usernameTaken",
	"emailTaken",
];

export default function create_acc() {
	const t = useTranslations("createAcc");
	// as mensagens de erro sao chaves, so viram texto aqui na renderizacao
	const tError = useTranslations("formErrors");

	const [user,setUser] = useState({
		username:"",email:"",password:""
	})
	// so um erro de cada vez, escolhido por prioridade em ERROR_ORDER
	const [error,setError] = useState<ErrorKey | null>(null);
	const [isSubmitting,setIsSubmitting] = useState(false);

	const router = useTransitionRouter();
	const { refresh } = useUser();

	const handleInputs=(e: ChangeEvent<HTMLInputElement>)=>{
		const name = e.currentTarget.name;
		const value = e.currentTarget.value;

		setError(null);
		setUser({...user,[name]:value});
	}

	const postData = async (e: React.SubmitEvent<HTMLFormElement>)=>{
		//Faz com que a info em ves de ser enviada pelo url seja enviada diretamente para o lado do backebd
		e.preventDefault();
		// sem isto, spammar Enter disparava um pedido por cada submit em vez de esperar o anterior acabar
		if (isSubmitting)
			return;
		setError(null);

		// campos vazios nem chegam a ir ao backend, mostra logo o primeiro em falta
		const missing = firstEmptyField([
			{ value: user.username, error: EMPTY_USERNAME },
			{ value: user.email, error: EMPTY_EMAIL },
			{ value: user.password, error: EMPTY_PASSWORD, trim: false },
		]);
		if (missing)
		{
			setError(missing);
			return;
		}
		setIsSubmitting(true);

		try {
			const result = await apiPost('/auth/register', user);

			if(result.ok)
			{
				await refresh();//Vai guardar o user
				router.push("/gamerooms");
				// limpa o router cache do estado de convidado; sem isto paginas
				// prefetched antes do registo (ex.: "/") continuavam a mostrar login
				router.refresh();
				return;//sai com o botao ainda desativado, a pagina esta a mudar
			}
			setError(pickError(result.errors, ERROR_ORDER));
		} catch {
			setError(GENERIC_ERROR);
		}
		//so chega aqui se o registo falhou, ent o botao volta a ficar clicavel
		setIsSubmitting(false);
	}

  return (
		<div className={styles.createAccWidget}>
		<div className={styles.mainText}>
			<div className={styles.title}>{t("title")}</div>
			<div className={styles.description}>{t("description")}</div>
		</div>
		<div>
			<form action="" method="Post" className={styles.form} onSubmit={postData}>
				<input className={styles.button} type="text" name="username" placeholder={t("username")} autoComplete="username" value={user.username} onChange={handleInputs}/>
				<input className={styles.button} type="email" name="email" placeholder={t("email")} autoComplete="email" value={user.email} onChange={handleInputs}/>
				<input className={styles.button} type="password" name="password" placeholder={t("password")} autoComplete="new-password" value={user.password} onChange={handleInputs}/>
				<button className={styles.buttonDark} type="submit" disabled={isSubmitting}>{t("submit")}</button>
			</form>
		</div>
		<div className={styles.errorSpace}>
		{error &&
			<div className={styles.errorWrapper}>
				<div className={styles.errorText}>{tError(error.key, error.params)}</div>
			</div>
		}
		</div>
		<div className={styles.authWrapper}>
			<div className={styles.authText}>
				<div className={styles.text}>{t("orCreateThrough")}</div>
			</div>
			<div className={styles.auths}>
				<button className={styles.buttonAuth} type="button" onClick={login42}>
					<Image width={60} height={60} sizes="100vw" alt="" src="/42Logo.svg" />
				</button>
				<button className={styles.buttonAuth} type="button" onClick={loginGoogle}>
					<Image width={40} height={40} sizes="100vw" alt="" src="/googleLogo.svg"/>
				</button>
			</div>
			<div className={styles.authText}>
				<div className={styles.text}>{t("alreadyHaveAccount")} <Link href="/log_in"><u><b>{t("here")}</b></u></Link></div>
			</div>
		</div>
	</div>
  )
}
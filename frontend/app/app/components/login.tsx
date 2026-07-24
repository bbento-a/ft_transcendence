"use client";

import styles from "./css_modules/login.module.css";
import Image from "next/image";
import Link from "next/link";
import React,{ useState ,ChangeEvent} from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "../lib/api";
import { useUser } from "@/context/AuthContext";

export default function login() {

	const [user,setUser] = useState({
		email:"",password:""
	})

	const [errors,setErrors] = useState<string[]>([]);
	const [isSubmitting,setIsSubmitting] = useState(false);

	const router = useRouter();
	const { refresh } = useUser();

	const handleInputs=(e: ChangeEvent<HTMLInputElement>)=>{
		const name = e.currentTarget.name;
		const value = e.currentTarget.value;

		setErrors([]);
		setUser({...user,[name]:value});
	}

	const postData = async (e: React.SubmitEvent<HTMLFormElement>)=>{
		//Faz com que a info em ves de ser enviada pelo url seja enviada diretamente para o lado do backebd
		e.preventDefault();
		// sem isto, spammar Enter disparava um pedido por cada submit em vez de esperar o anterior acabar
		if (isSubmitting)
			return;
		setErrors([]);
		setIsSubmitting(true);

		try {
			const result = await apiPost('/auth/login', user);

			if(result.ok)
			{
				await refresh();//Vai guardar o user
				router.push("/gamerooms");
				return;//sai com o botao ainda desativado, a pagina esta a mudar
			}
			setErrors(result.errors);
		} catch {
			setErrors(["Something went wrong, please try again."]);
		}
		//so chega aqui se o login falhou, ent o botao volta a ficar clicavel
		setIsSubmitting(false);
	}


  return (
	<div className={styles.logInWidget}>
		<div className={styles.mainText}>
			<div className={styles.title}>Log in</div>
			<div className={styles.description}>Enter with your account to start playing!</div>
		</div>
		<div>
			<form action="" method="Post" className={styles.loginForm} onSubmit={postData}>
				<input className={styles.button} type="email" name="email" placeholder="Email" autoComplete="email" value={user.email} onChange={handleInputs}/>
				<input className={styles.button} type="password" name="password" placeholder="Password" autoComplete="current-password" value={user.password} onChange={handleInputs}/>
				<button className={styles.buttonDark} type="submit" disabled={isSubmitting}>{isSubmitting ? "Entering..." : "Enter"}</button>
			</form>
		</div>
		{errors.length > 0 &&
			<div className={styles.errorWrapper}>
				{errors.map((msg,i) => <div key={i} className={styles.errorText}>{msg}</div>)}
			</div>
		}
		<div className={styles.authText}>
			<div className={styles.text}>or log through</div>
		</div>
			<div className={styles.auths}>
				<button className={styles.buttonAuth}>
					<Image width={78} height={78} sizes="100vw" alt="" src="/42Logo.svg" />
				</button>
				<button className={styles.buttonAuth}>
					<Image width={50} height={50} sizes="100vw" alt="" src="/googleLogo.svg"/>
				</button>
			</div>
			<div className={styles.authText}>
				<div className={styles.text}>No account yet? Create an account <Link href="/create_account" color="#ffffff"><u><b>here</b></u></Link></div>
			</div>
	</div>
  )
}

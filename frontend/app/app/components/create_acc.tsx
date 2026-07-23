"use client";

import styles from "./css_modules/create_acc.module.css";
import Image from "next/image";
import Link from "next/link";
import React,{ useState ,ChangeEvent} from "react";
import { useRouter } from "next/navigation";

export default function create_acc() {
	
	const [user,setUser] = useState({
		username:"",email:"",password:""
	})
	const [errors,setErrors] = useState<string[]>([]);
	
	const router = useRouter();

	const handleInputs=(e: ChangeEvent<HTMLInputElement>)=>{
		const name = e.currentTarget.name;
		const value = e.currentTarget.value;

		setUser({...user,[name]:value});
	}

	const postData = async (e: React.SubmitEvent<HTMLFormElement>)=>{
		//Faz com que a info em ves de ser enviada pelo url seja enviada diretamente para o lado do backebd
		e.preventDefault();
		setErrors([]);

		const res = await fetch('/api/auth/register',{
			method: "POST",
			headers:{
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(user),
		});

		const data = await res.json();

		if(res.status === 201)
		{
			router.push("/gamerooms");
		}else{
			// ValidationPipe devolve message como array; ConflictException devolve uma string
			setErrors(Array.isArray(data.message) ? data.message : [data.message]);
		}
	}

  return (
		<div className={styles.createAccWidget}>
		<div className={styles.mainText}>
			<div className={styles.title}>Create account</div>
			<div className={styles.description}>Create an account and log in to start playing!</div>
		</div>
		<div>
			<form action="" method="Post" className={styles.form} onSubmit={postData}>
				<input className={styles.button} type="text" name="username" placeholder="Username" value={user.username} onChange={handleInputs}/>
				<input className={styles.button} type="email" name="email" placeholder="Email" value={user.email} onChange={handleInputs}/>
				<input className={styles.button} type="password" name="password" placeholder="Password" value={user.password} onChange={handleInputs}/>
				<button className={styles.buttonDark} type="submit">Enter</button>
			</form>
		</div>
		{errors.length > 0 &&
			<div className={styles.errorWrapper}>
				{errors.map((msg,i) => <div key={i} className={styles.errorText}>{msg}</div>)}
			</div>
		}
		<div className={styles.authText}>
			<div className={styles.text}>or create through</div>
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
				<div className={styles.text}>Already have an account? Log in <Link href="/log_in" color="#ffffff"><u><b>here</b></u></Link></div>
			</div>
	</div>
  )
}

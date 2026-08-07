"use client";

import styles from "./page.module.css"
import React, { useState, useRef, ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { useUser } from "@/context/AuthContext";
import { apiPatch } from "../lib/api";
import { AVATAR_ERROR, GENERIC_ERROR, NO_CHANGES, PASSWORD_MISMATCH, RATE_LIMITED, ErrorKey, ErrorName, pickError } from "../lib/formErrors";
import { USERNAME_MAX, EMAIL_MAX, PASSWORD_MAX } from "../lib/fieldLimits";

import BackArrow from "../components/backArrow";

/*
Ordem por que os erros do backend sao mostrados, um de cada vez em vez de todos
juntos. Segue os campos de cima para baixo do form (username, email, password
atual, password nova), e deixa para o fim o que so o servidor sabe: password
atual errada e conflitos com outras contas. Ganha o primeiro que der match.
*/
const ERROR_ORDER: ErrorName[] = [
	// o servidor nem respondeu, ou recusou o pedido inteiro: nao ha nada a dizer
	// sobre os campos
	"offline",
	"tooLarge",
	"rateLimited",
	// a sessao morreu, nao vale a pena queixarmo-nos dos campos
	"sessionExpired",
	"usernameEmpty",
	"usernameMin",
	"usernameMax",
	"usernamePattern",
	"emailInvalid",
	"currentPasswordEmpty",
	"passwordMin",
	"passwordMax",
	"currentPasswordRequired",
	"invalidCredentials",
	"usernameTaken",
	"emailTaken",
	"emailFromProvider",
];

/*
Mostra so os primeiros 3 caracteres da parte local do email (antes do @) e
mascara o resto, mantendo o dominio visivel.
  olabomdia@gmail.com  ->  ola**********@gmail.com
*/
const EMAIL_MASK = "*".repeat(10);
function maskEmail(email: string): string {
	const at = email.indexOf("@");
	if (at === -1) return email; // sem @: nao e um email normal, nao arriscamos
	const local = email.slice(0, at);
	const domain = email.slice(at); // inclui o proprio "@"
	return `${local.slice(0, 3)}${EMAIL_MASK}${domain}`;
}

export default function page() {
	const t = useTranslations("settings");
	// as mensagens de erro sao chaves, so viram texto aqui na renderizacao
	const tError = useTranslations("formErrors");
	// texto que so os leitores de ecra veem, ver namespace a11y
	const tA11y = useTranslations("a11y");
	const { user, refresh } = useUser();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleButtonClick = () => {
	  fileInputRef.current?.click();
	};

	const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
	  const input = e.currentTarget;
	  const file = input.files?.[0];
	  // limpamos o input logo: sem isto escolher o MESMO ficheiro outra vez
	  // (depois de um erro) nao disparava o onChange, e nada acontecia
	  input.value = "";
	  if (!file) return;

	  setError(null);
	  setSuccess(false);

	  const formData = new FormData();
	  formData.append("avatar", file);

	  try {
	    const res = await fetch("/api/auth/avatar", {
	      method: "POST",
	      body: formData,
	      credentials: "include",
	    });

	    // falhava em silencio: a foto nao mudava e nao havia nada no ecra a dizer porque
	    if (!res.ok) {
	      // o 429 do throttler nao tem nada a ver com o ficheiro escolhido; sem
	      // esta distincao quem batesse no limite lia uma queixa sobre o formato
	      setError(res.status === 429 ? RATE_LIMITED : AVATAR_ERROR);
	      return;
	    }
	  } catch {
	    setError(GENERIC_ERROR);
	    return;
	  }

	  await refresh();
	};

	// Contas so-OAuth (Google/42) nao tem password local; email e password
	// sao geridos pelo provider, entao so deixamos mudar o username
	const isLocalAccount = !!user?.hasPassword;

	const [form, setForm] = useState({
		username: "", email: "", currentPassword: "", newPassword: "", confirmPassword: ""
	});
	// so um erro de cada vez, escolhido por prioridade em ERROR_ORDER
	const [error, setError] = useState<ErrorKey | null>(null);
	const [success, setSuccess] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleInputs = (e: ChangeEvent<HTMLInputElement>) => {
		const name = e.currentTarget.name;
		const value = e.currentTarget.value;

		setError(null);
		setSuccess(false);
		setForm({ ...form, [name]: value });
	}

	const postData = async (e: React.SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		// sem isto, spammar Enter disparava um pedido por cada submit em vez de esperar o anterior acabar
		if (isSubmitting)
			return;
		setError(null);
		setSuccess(false);

		// verificacao so do cliente, o backend nem conhece o campo de confirmacao
		if (form.newPassword && form.newPassword !== form.confirmPassword) {
			setError(PASSWORD_MISMATCH);
			return;
		}

		// so mandamos os campos que o user preencheu, o resto fica como esta
		const payload: Record<string, string> = {};
		if (form.username) payload.username = form.username;
		if (form.email) payload.email = form.email;
		if (form.newPassword) {
			payload.newPassword = form.newPassword;
			payload.currentPassword = form.currentPassword;
		}

		// sem isto o Save nao fazia nada visivel quando o form estava todo vazio
		if (Object.keys(payload).length === 0) {
			setError(NO_CHANGES);
			return;
		}

		setIsSubmitting(true);

		try {
			const result = await apiPatch('/auth/me', payload);

			if (result.ok) {
				await refresh();
				setForm({ username: "", email: "", currentPassword: "", newPassword: "", confirmPassword: "" });
				setSuccess(true);
				setIsSubmitting(false);
				return;
			}
			setError(pickError(result.errors, ERROR_ORDER));
		} catch {
			setError(GENERIC_ERROR);
		}
		setIsSubmitting(false);
	}

  	return (
  	<div className={styles.pageWrapper}>
		<div className={styles.pageGroup}>
        	<div className={styles.profileGroup}>
				<div className={styles.profileIcon}>
					<img
					  className={styles.profilePic}
					  src={
					    user?.avatarUrl
					      ? `${user.avatarUrl}`
					      : "/profile.svg"
					  }
					  alt={tA11y("profilePicture")}
					  width={250}
					  height={250}
					/>
				</div>
				<button className={styles.buttonProfile} onClick={handleButtonClick}>
				  <div className={styles.buttonText}>{t("changepfp")}</div>
				</button>
				<input
				  ref={fileInputRef}
				  type="file"
				  accept="image/*"
				  style={{ display: "none" }}
				  onChange={handleFileChange}
				/>
				<div>

				<div className={styles.infoGroup}>
					<div className={styles.info}>
						<div className={styles.fieldDescription}>{t("username")}
							<div className={styles.fieldInfo}>{user?.username}</div>
							</div>
						</div>
						<div className={styles.info}>
							<div className={styles.fieldDescription}>{t("email")}
								<div className={styles.fieldInfo}>{user?.email ? maskEmail(user.email) : ""}</div>
							</div>
						</div>
					</div>
				</div>
			</div>

		</div>
			<div className={styles.pageGroup}>
				<div className={styles.formGroup}>
					<form className={styles.formGroup} onSubmit={postData}>
						<label className={styles.formDescription} htmlFor="username">{t("changeusername")}</label>
						<input className={styles.formField} id="username" type="text" name="username" placeholder={t("newusername")} autoComplete="username" maxLength={USERNAME_MAX} value={form.username} onChange={handleInputs}/>
						{isLocalAccount ? (
							<>
								<label className={styles.formDescription} htmlFor="email">{t("changeemail")}</label>
								<input className={styles.formField} id="email" type="email" name="email" placeholder={t("newemail")} autoComplete="email" maxLength={EMAIL_MAX} value={form.email} onChange={handleInputs}/>
								<label className={styles.formDescription} htmlFor="currentPassword">{t("currentpassword")}</label>
								<input className={styles.formField} id="currentPassword" type="password" name="currentPassword" placeholder={t("currentpasswordplaceholder")} autoComplete="current-password" maxLength={PASSWORD_MAX} value={form.currentPassword} onChange={handleInputs}/>
								<label className={styles.formDescription} htmlFor="newPassword">{t("changepassword")}</label>
								<input className={styles.formField} id="newPassword" type="password" name="newPassword" placeholder={t("newpassword")} autoComplete="new-password" maxLength={PASSWORD_MAX} value={form.newPassword} onChange={handleInputs}/>
								<label className={styles.formDescription} htmlFor="confirmPassword">{t("confirmpassword")}</label>
								<input className={styles.formField} id="confirmPassword" type="password" name="confirmPassword" placeholder={t("confirmpasswordplaceholder")} autoComplete="new-password" maxLength={PASSWORD_MAX} value={form.confirmPassword} onChange={handleInputs}/>
							</>
						) : (
							<div className={styles.oauthNote}>{t("oauthaccountnote")}</div>
						)}
							<button className={styles.confirmButton} type="submit" disabled={isSubmitting}>
								<div className={styles.buttonText}>{t("save")}</div>
							</button>
					</form>
					{error &&
						<div className={styles.errorWrapper}>
							<div className={styles.errorText}>{tError(error.key, error.params)}</div>
						</div>
					}
					{success &&
						<div className={styles.errorWrapper}>
							<div className={styles.successText}>{t("success")}</div>
						</div>
					}
				</div>
			</div>
			<div className={styles.buttonWrapper}><BackArrow /></div>
		</div>
	)
}

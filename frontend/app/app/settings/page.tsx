"use client";

import styles from "./page.module.css"
import Image from 'next/image'
import React, { useState, ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { useUser } from "@/context/AuthContext";
import { apiPatch } from "../lib/api";

export default function page() {
	const t = useTranslations("settings");

	const { user, refresh } = useUser();

	// Contas so-OAuth (Google/42) nao tem password local, entao nao ha o que mudar
	const canChangePassword = !!user?.hasPassword;

	const [form, setForm] = useState({
		username: "", email: "", currentPassword: "", newPassword: "", confirmPassword: ""
	});
	const [errors, setErrors] = useState<string[]>([]);
	const [success, setSuccess] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleInputs = (e: ChangeEvent<HTMLInputElement>) => {
		const name = e.currentTarget.name;
		const value = e.currentTarget.value;

		setErrors([]);
		setSuccess(false);
		setForm({ ...form, [name]: value });
	}

	const postData = async (e: React.SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		// sem isto, spammar Enter disparava um pedido por cada submit em vez de esperar o anterior acabar
		if (isSubmitting)
			return;
		setErrors([]);
		setSuccess(false);

		if (form.newPassword && form.newPassword !== form.confirmPassword) {
			setErrors([t("passwordmismatch")]);
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

		if (Object.keys(payload).length === 0)
			return;

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
			setErrors(result.errors);
		} catch {
			setErrors(["Something went wrong, please try again."]);
		}
		setIsSubmitting(false);
	}

  	return (
  	<div className={styles.pageWrapper}>
		<div className={styles.pageGroup}>
        	<div className={styles.profileGroup}>
			    <Image className={styles.profileIcon} width={150} height={150} sizes="100vw" alt="" src="/profileDark.svg"></Image>
				<button className={styles.buttonProfile}>
					<div className={styles.buttonText}>{t("changepfp")}</div>
				</button>
			</div>

			<div className={styles.infoGroup}>
				<div className={styles.info}>
					<div className={styles.fieldDescription}>{t("username")}
						<div className={styles.fieldInfo}>{user?.username}</div>
					</div>
				</div>
				<div className={styles.info}>
					<div className={styles.fieldDescription}>{t("email")}
						<div className={styles.fieldInfo}>{user?.email}</div>
					</div>
				</div>
			</div>
		</div>
			<div className={styles.pageGroup}>
				<div className={styles.formGroup}>
					<form className={styles.formGroup} onSubmit={postData}>
						<label className={styles.formDescription} htmlFor="username">{t("changeusername")}</label>
						<input className={styles.formField} id="username" type="text" name="username" placeholder={t("newusername")} autoComplete="username" value={form.username} onChange={handleInputs}/>
						<label className={styles.formDescription} htmlFor="email">{t("changeemail")}</label>
						<input className={styles.formField} id="email" type="email" name="email" placeholder={t("newemail")} autoComplete="email" value={form.email} onChange={handleInputs}/>
						{canChangePassword ? (
							<>
								<label className={styles.formDescription} htmlFor="currentPassword">{t("currentpassword")}</label>
								<input className={styles.formField} id="currentPassword" type="password" name="currentPassword" placeholder={t("currentpasswordplaceholder")} autoComplete="current-password" value={form.currentPassword} onChange={handleInputs}/>
								<label className={styles.formDescription} htmlFor="newPassword">{t("changepassword")}</label>
								<input className={styles.formField} id="newPassword" type="password" name="newPassword" placeholder={t("newpassword")} autoComplete="new-password" value={form.newPassword} onChange={handleInputs}/>
								<label className={styles.formDescription} htmlFor="confirmPassword">{t("confirmpassword")}</label>
								<input className={styles.formField} id="confirmPassword" type="password" name="confirmPassword" placeholder={t("confirmpasswordplaceholder")} autoComplete="new-password" value={form.confirmPassword} onChange={handleInputs}/>
							</>
						) : (
							<div className={styles.oauthNote}>{t("oauthpasswordnote")}</div>
						)}
							<button className={styles.confirmButton} type="submit" disabled={isSubmitting}>
								<div className={styles.buttonText}>{t("save")}</div>
							</button>
					</form>
					{errors.length > 0 &&
						<div className={styles.errorWrapper}>
							{errors.map((msg, i) => <div key={i} className={styles.errorText}>{msg}</div>)}
						</div>
					}
					{success &&
						<div className={styles.errorWrapper}>
							<div className={styles.successText}>{t("success")}</div>
						</div>
					}
				</div>
			</div>
		</div>
	)
}

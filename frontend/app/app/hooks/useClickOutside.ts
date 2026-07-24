"use client";

import { RefObject, useEffect } from "react";

/*
	Fecha um menu quando o click acontece fora dele.

	Recebe uma lista de refs porque normalmente ha 2 elementos que contam como
	"dentro": o botao que abre o menu e o proprio menu. Se so olhassemos para o
	menu, o click no botao fechava-o aqui e o onClick voltava a abri-lo.

	Usamos mousedown  para o menu fechar assim que se carrega, sem
	esperar que o rato seja largado.

	O Escape tambem fecha, que e o que se espera de qualquer menu.
*/
export default function useClickOutside(
	refs: RefObject<HTMLElement | null>[],
	onOutside: () => void,
	enabled: boolean = true,
) {
	useEffect(() => {
		if (!enabled)
			return;

		const handleClick = (event: MouseEvent) => {
			const target = event.target as Node;
			const inside = refs.some((ref) => ref.current?.contains(target));

			if (!inside)
				onOutside();
		};

		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape")
				onOutside();
		};

		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleKey);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleKey);
		};
	});
}

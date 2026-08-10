"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";

/*
  Ligacao leve ao gateway so para tempo real do dashboard: ouve o evento
  'statsUpdated' (emitido pelo backend quando um jogo do utilizador termina) e
  chama onUpdate. E uma ligacao propria, separada da do jogo — o servidor mete
  qualquer ligacao autenticada na room pessoal do userId, por isso este socket
  recebe o aviso mesmo sem estar num jogo.

  onUpdate deve ser estavel (useCallback), senao o socket religa a cada render.
  enabled=false nao liga sequer o socket — usado quando vemos o dashboard de
  OUTRA pessoa (o evento so chega a quem jogou, nao faz sentido ouvir).
*/
export function useStatsSocket(onUpdate: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
 
    const socket = io({ withCredentials: true, query: { scope: "stats" } });
    socket.on("statsUpdated", onUpdate);
    return () => {
      socket.off("statsUpdated", onUpdate);
      socket.disconnect();
    };
  }, [onUpdate, enabled]);
}

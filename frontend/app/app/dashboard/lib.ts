/*
  Logica pura do dashboard: tipos, cores e transformacoes dos dados que vêm do
  backend (GET /api/stats/me).
*/

// ---- Tipos (espelham a resposta do StatsService no backend) ----

export type ResultKind = "win" | "loss" | "draw";

export type MatchRow = {
  opponent: string;
  opponentId: string | null;
  result: string; // "win" | "loss" | "draw"
  difficulty: string | null; // "easy"|"medium"|"hard" (so vs bot), senao null
  createdAt: string;
};

export type StatsResponse = {
  user: { id: string; username: string; avatarUrl: string | null };
  totals: { wins: number; losses: number; draws: number; total: number };
  matches: MatchRow[];
};

// ---- Cores por resultado ----
export const RESULT_COLORS: Record<ResultKind, string> = {
  win: "#1baf7a",
  loss: "#e34948",
  draw: "#2a78d6",
};

// Ordem fixa em que os resultados aparecem em legendas/pie (nunca ciclada).
export const RESULT_ORDER: ResultKind[] = ["win", "loss", "draw"];

// ---- Transformacoes para cada grafico ----

// Dados do pie: uma fatia por resultado com contagem > 0. Os rotulos vêm
// traduzidos de fora (i18n), por isso recebemos um mapa key->label.
export function toPieData(
  totals: StatsResponse["totals"],
  labels: Record<ResultKind, string>,
) {
  const value: Record<ResultKind, number> = {
    win: totals.wins,
    loss: totals.losses,
    draw: totals.draws,
  };
  return RESULT_ORDER.filter((k) => value[k] > 0).map((k) => ({
    key: k,
    name: labels[k],
    value: value[k],
    color: RESULT_COLORS[k],
  }));
}

// Agrupa as partidas por dia (YYYY-MM-DD) para o grafico de barras empilhadas.
// Assume matches ja por ordem cronologica (o backend ordena por createdAt asc).
export type DayBucket = {
  date: string;
  win: number;
  loss: number;
  draw: number;
  total: number;
};

export function groupByDay(matches: MatchRow[]): DayBucket[] {
  const byDay = new Map<string, DayBucket>();
  for (const m of matches) {
    const date = m.createdAt.slice(0, 10);
    const bucket =
      byDay.get(date) ?? { date, win: 0, loss: 0, draw: 0, total: 0 };
    if (m.result === "win") bucket.win++;
    else if (m.result === "loss") bucket.loss++;
    else if (m.result === "draw") bucket.draw++;
    bucket.total++;
    byDay.set(date, bucket);
  }
  return Array.from(byDay.values());
}

// Serie da taxa de vitorias ACUMULADA ao longo do tempo, para o grafico de linha.
// Cada ponto = winrate (%) considerando todas as partidas ate esse jogo.
export type WinRatePoint = { index: number; date: string; winRate: number };

export function winRateSeries(matches: MatchRow[]): WinRatePoint[] {
  let wins = 0;
  const points: WinRatePoint[] = [];
  matches.forEach((m, i) => {
    if (m.result === "win") wins++;
    const played = i + 1;
    points.push({
      index: played,
      date: m.createdAt.slice(0, 10),
      winRate: Math.round((wins / played) * 100),
    });
  });
  return points;
}

// ---- Modo: todos / vs jogador / vs bot ----

export type GameMode = "all" | "player" | "bot";

// Uma partida e contra o bot sse nao tem opponentId (so a IA fica sem id; os
// humanos guardam sempre o id do adversario). NAO se usa o nome do adversario
// para isto — o bot e mostrado como "Bot", nao "AI", por isso comparar nomes
// deixava jogos do bot escaparem para o modo "vs Jogador".
export function isBotMatch(m: MatchRow): boolean {
  return m.opponentId === null;
}

// Filtra as partidas pelo modo.
export function filterByMode(matches: MatchRow[], mode: GameMode): MatchRow[] {
  if (mode === "all") return matches;
  if (mode === "bot") return matches.filter(isBotMatch);
  return matches.filter((m) => !isBotMatch(m));
}

// Filtra por intervalo de datas NO CLIENTE. Fazemos aqui (e nao a repedir ao
// backend a cada clique num preset) para o filtro ser instantaneo e nao bater
// no rate limit do servidor. Ambos os limites sao opcionais.
export function filterByDateRange(
  matches: MatchRow[],
  range: { from?: Date; to?: Date },
): MatchRow[] {
  if (!range.from && !range.to) return matches;
  const fromMs = range.from?.getTime();
  const toMs = range.to?.getTime();
  return matches.filter((m) => {
    const t = new Date(m.createdAt).getTime();
    if (fromMs !== undefined && t < fromMs) return false;
    if (toMs !== undefined && t > toMs) return false;
    return true;
  });
}

// Recalcula os totais W/L/D a partir de uma lista de partidas (usado depois de
// filtrar por modo, ja que os totais do backend sao do conjunto todo).
export function computeTotals(matches: MatchRow[]) {
  const totals = { wins: 0, losses: 0, draws: 0, total: matches.length };
  for (const m of matches) {
    if (m.result === "win") totals.wins++;
    else if (m.result === "loss") totals.losses++;
    else if (m.result === "draw") totals.draws++;
  }
  return totals;
}

// ---- Analise por dificuldade do bot ----

export type DifficultyKey = "easy" | "medium" | "hard";
export const DIFFICULTY_ORDER: DifficultyKey[] = ["easy", "medium", "hard"];

export type DifficultyStat = {
  difficulty: DifficultyKey;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  // Quantos jogos ate a PRIMEIRA vitoria neste nivel (1-indexado). null se ainda
  // nao venceu — e este numero que responde ao "quantas tentativas custou o hard".
  attemptsToFirstWin: number | null;
};

// Constroi uma linha por nivel de dificuldade a partir das partidas vs bot.
// Espera as partidas por ordem cronologica (o backend devolve asc).
export function difficultyBreakdown(botMatches: MatchRow[]): DifficultyStat[] {
  return DIFFICULTY_ORDER.map((difficulty) => {
    const games = botMatches.filter((m) => m.difficulty === difficulty);
    let wins = 0,
      losses = 0,
      draws = 0,
      attemptsToFirstWin: number | null = null;
    games.forEach((m, i) => {
      if (m.result === "win") {
        wins++;
        if (attemptsToFirstWin === null) attemptsToFirstWin = i + 1;
      } else if (m.result === "loss") losses++;
      else if (m.result === "draw") draws++;
    });
    return {
      difficulty,
      games: games.length,
      wins,
      losses,
      draws,
      winRate: games.length ? Math.round((wins / games.length) * 100) : 0,
      attemptsToFirstWin,
    };
  }).filter((d) => d.games > 0); // so mostra niveis que a pessoa jogou
}

// ---- Export CSV ----

// Escapa um valor para CSV: se tiver aspas, virgula ou quebra de linha, poe
// entre aspas e duplica as aspas internas.
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Converte as partidas (ja filtradas) numa string CSV com cabecalho. Dados crus
// (result/difficulty como estao na BD) — e um export de dados, nao de UI.
export function matchesToCsv(matches: MatchRow[]): string {
  const header = ["opponent", "result", "difficulty", "date"];
  const lines = matches.map((m) =>
    [m.opponent, m.result, m.difficulty ?? "", m.createdAt].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

// ---- Filtros de intervalo de datas ----

export type PresetKey = "all" | "7d" | "30d" | "90d" | "mtd";

// Converte um preset num intervalo {from, to} de Datas. `to` fica sempre no fim
// do dia para o filtro ser inclusivo (o backend compara createdAt <= to, e uma
// data "pura" seria a meia-noite, cortando os jogos desse mesmo dia).
export function presetRange(preset: PresetKey): { from?: Date; to?: Date } {
  if (preset === "all") return {};

  const to = endOfDay(new Date());
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  if (preset === "7d") from.setDate(from.getDate() - 6);
  else if (preset === "30d") from.setDate(from.getDate() - 29);
  else if (preset === "90d") from.setDate(from.getDate() - 89);
  else if (preset === "mtd") from.setDate(1); // inicio do mes atual

  return { from, to };
}

export function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

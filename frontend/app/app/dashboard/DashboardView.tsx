"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
// router.back() nao precisa de nada: o popstate ja e animado pela biblioteca.
// O useTransitionRouter e para os push (pesquisa de outro dashboard).
import { Link, useTransitionRouter } from "next-view-transitions";
import { useTranslations, useLocale } from "next-intl";
import { useStatsSocket } from "../hooks/useStatsSocket";
import styles from "./page.module.css";
import {
  StatsResponse,
  ResultKind,
  PresetKey,
  GameMode,
  DifficultyKey,
  presetRange,
  startOfDay,
  endOfDay,
  toPieData,
  groupByDay,
  winRateSeries,
  filterByMode,
  filterByDateRange,
  computeTotals,
  difficultyBreakdown,
  matchesToCsv,
} from "./lib";
import {
  StatTiles,
  ResultPie,
  GamesBar,
  WinRateLine,
  MatchesTable,
  DifficultyTable,
  RECENT_LIMIT,
} from "./components";

// Presets de intervalo mostrados como botoes, por ordem.
const PRESETS: PresetKey[] = ["all", "7d", "30d", "90d", "mtd"];
// Modos: todos / vs jogador / vs bot.
const MODES: GameMode[] = ["all", "player", "bot"];

/*
  Corpo do dashboard, partilhado por duas rotas:
    /dashboard            -> username undefined  => as MINHAS stats (/stats/me)
    /dashboard/[username] -> as stats de OUTRO   (/stats/user/:username)
  Tudo o resto (graficos, filtros, export) e igual nos dois casos.
*/
export default function DashboardView({ username }: { username?: string }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useTransitionRouter();
  const isOwn = !username;

  const [preset, setPreset] = useState<PresetKey>("all");
  // Intervalo personalizado (inputs de data). Quando preenchido, ganha ao preset.
  const [custom, setCustom] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // Modo de adversario. Filtra-se no cliente (temos ja todas as partidas), por
  // isso trocar de modo e instantaneo — nao refaz o pedido ao backend.
  const [mode, setMode] = useState<GameMode>("all");
  // Texto da caixa de pesquisa de jogadores.
  const [search, setSearch] = useState("");

  // Rotulos traduzidos passados aos componentes (que nao conhecem i18n).
  const labels: Record<ResultKind, string> = useMemo(
    () => ({ win: t("wins"), loss: t("losses"), draw: t("draws") }),
    [t],
  );
  const difficultyLabels: Record<DifficultyKey, string> = useMemo(
    () => ({ easy: t("easy"), medium: t("medium"), hard: t("hard") }),
    [t],
  );

  // Decide o intervalo efetivo: o custom manda se tiver pelo menos uma data,
  // senao usa o preset selecionado.
  const range = useMemo(() => {
    if (custom.from || custom.to) {
      return {
        from: custom.from ? startOfDay(new Date(custom.from)) : undefined,
        to: custom.to ? endOfDay(new Date(custom.to)) : undefined,
      };
    }
    return presetRange(preset);
  }, [custom, preset]);

  // Busca UMA vez as partidas do utilizador em causa (o proprio ou outro). Os
  // filtros (datas e modo) sao aplicados no cliente, por isso trocar de
  // preset/intervalo nao faz pedidos novos — instantaneo e sem bater no rate
  // limit. silent=true (tempo real): atualiza sem o ecra de loading.
  const fetchStats = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(false);
      setNotFound(false);
      try {
        const url = username
          ? `/api/stats/user/${encodeURIComponent(username)}`
          : `/api/stats/me`;
        const res = await fetch(url);
        if (res.status === 404) {
          setNotFound(true);
          setData(null);
          return;
        }
        if (!res.ok) throw new Error("bad status");
        setData(await res.json());
      } catch {
        if (!silent) setError(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [username],
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Tempo real: so no MEU dashboard (o evento 'statsUpdated' so chega a quem
  // jogou). Ao ver o de outra pessoa nem ligamos o socket.
  // Debounce: se varios jogos acabarem em rajada, coalescemos num so refetch.
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onStatsUpdate = useCallback(() => {
    if (updateTimer.current) clearTimeout(updateTimer.current);
    updateTimer.current = setTimeout(() => fetchStats(true), 400);
  }, [fetchStats]);
  useEffect(() => {
    return () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
    };
  }, []);
  useStatsSocket(onStatsUpdate, isOwn);

  // Partidas apos aplicar o intervalo de datas E o modo (all / player / bot).
  const matches = useMemo(() => {
    if (!data) return [];
    return filterByMode(filterByDateRange(data.matches, range), mode);
  }, [data, range, mode]);

  // Dados derivados para cada grafico, todos a partir do conjunto ja filtrado.
  const totals = useMemo(() => computeTotals(matches), [matches]);
  const pieData = useMemo(() => toPieData(totals, labels), [totals, labels]);
  const dayData = useMemo(() => groupByDay(matches), [matches]);
  const rateData = useMemo(() => winRateSeries(matches), [matches]);
  const diffStats = useMemo(
    () => (mode === "bot" ? difficultyBreakdown(matches) : []),
    [mode, matches],
  );
  const winRatePct =
    totals.total > 0 ? Math.round((totals.wins / totals.total) * 100) : 0;

  const hasMatches = matches.length > 0;

  // Export CSV das partidas atualmente visiveis (respeita modo + datas).
  const exportCsv = () => {
    const blob = new Blob([matchesToCsv(matches)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stats-${data?.user.username ?? "me"}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export PDF: usa a impressao do browser + o @media print da folha de estilos.
  const exportPdf = () => window.print();

  // Pesquisa: leva ao dashboard do username escrito.
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const name = search.trim();
    if (name) router.push(`/dashboard/${encodeURIComponent(name)}`);
  };

  return (
    <div className={styles.pageWrapper}>
      {/* Botao voltar */}
      <div className={styles.backWrapper}>
        <button onClick={() => router.back()} aria-label="Back">
          <Image
            className={styles.backIcon}
            width={30}
            height={30}
            alt=""
            src="/arrow.svg"
          />
        </button>
      </div>

      <div className={styles.content}>
        <h1 className={styles.title}>{t("title")}</h1>

        {/* Cabecalho: de quem sao as stats (avatar + nome) + pesquisa */}
        <div className={styles.topBar}>
          {data ? (
            <div className={styles.viewingUser}>
              <img
                className={styles.viewingAvatar}
                src={data.user.avatarUrl ?? "/profile.svg"}
                alt=""
                width={40}
                height={40}
              />
              <span className={styles.viewingName}>{data.user.username}</span>
              {!isOwn && (
                <Link href="/dashboard" className={styles.backToMine}>
                  {t("myDashboard")}
                </Link>
              )}
            </div>
          ) : (
            <span />
          )}

          <form className={styles.search} onSubmit={submitSearch}>
            <input
              className={styles.searchInput}
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className={styles.searchBtn} type="submit" aria-label="Search">
              🔍
            </button>
          </form>
        </div>

        {/* Modo de adversario: todos / vs jogador / vs bot */}
        <div className={styles.modeToggle}>
          {MODES.map((m) => (
            <button
              key={m}
              className={mode === m ? styles.presetActive : styles.preset}
              onClick={() => setMode(m)}
            >
              {t(`mode_${m}`)}
            </button>
          ))}
        </div>

        {/* Filtro de datas: presets + intervalo personalizado */}
        <div className={styles.filters}>
          <div className={styles.presets}>
            {PRESETS.map((p) => (
              <button
                key={p}
                className={
                  preset === p && !custom.from && !custom.to
                    ? styles.presetActive
                    : styles.preset
                }
                onClick={() => {
                  setPreset(p);
                  setCustom({ from: "", to: "" });
                }}
              >
                {t(`preset_${p}`)}
              </button>
            ))}
          </div>
          <div className={styles.customRange}>
            <input
              type="date"
              className={styles.dateInput}
              value={custom.from}
              max={custom.to || undefined}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
            <span className={styles.rangeDash}>—</span>
            <input
              type="date"
              className={styles.dateInput}
              value={custom.to}
              min={custom.from || undefined}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </div>
        </div>

        {/* Estados: carregar / nao encontrado / erro / sem jogos / conteudo */}
        {loading ? (
          <div className={styles.stateMsg}>{t("loading")}</div>
        ) : notFound ? (
          <div className={styles.stateMsg}>{t("userNotFound")}</div>
        ) : error ? (
          <div className={styles.stateMsg}>{t("error")}</div>
        ) : !hasMatches ? (
          // Distingue "nao ha jogos neste filtro" de "nunca jogou".
          <div className={styles.stateMsg}>
            {data && data.matches.length > 0 ? t("emptyFilter") : t("empty")}
          </div>
        ) : (
          <>
            {/* Barra de export (escondida na impressao pelo @media print) */}
            <div className={styles.exportBar}>
              <button className={styles.exportBtn} onClick={exportCsv}>
                {t("exportCsv")}
              </button>
              <button className={styles.exportBtn} onClick={exportPdf}>
                {t("exportPdf")}
              </button>
            </div>

            <StatTiles
              totals={totals}
              labels={labels}
              winRatePct={winRatePct}
              totalLabel={t("totalGames")}
              winRateLabel={t("winRate")}
            />

            <div className={styles.chartsGrid}>
              {/* So no modo bot: quantas tentativas custou cada nivel */}
              {mode === "bot" && diffStats.length > 0 && (
                <section className={`${styles.card} ${styles.cardWide}`}>
                  <h2 className={styles.cardTitle}>{t("byDifficulty")}</h2>
                  <DifficultyTable
                    stats={diffStats}
                    difficultyLabels={difficultyLabels}
                    headers={{
                      difficulty: t("difficulty"),
                      games: t("totalGames"),
                      record: t("record"),
                      winRate: t("winRate"),
                      firstWin: t("attemptsToFirstWin"),
                    }}
                    notBeaten={t("notBeaten")}
                  />
                </section>
              )}

              <section className={styles.card}>
                <h2 className={styles.cardTitle}>{t("distribution")}</h2>
                <div className={styles.chartBox}>
                  <ResultPie data={pieData} />
                </div>
              </section>

              <section className={styles.card}>
                <h2 className={styles.cardTitle}>{t("gamesPerDay")}</h2>
                <div className={styles.chartBox}>
                  <GamesBar data={dayData} labels={labels} />
                </div>
              </section>

              <section className={`${styles.card} ${styles.cardWide}`}>
                <h2 className={styles.cardTitle}>{t("winRateOverTime")}</h2>
                <div className={styles.chartBox}>
                  <WinRateLine data={rateData} label={t("winRate")} />
                </div>
              </section>

              <section className={`${styles.card} ${styles.cardWide}`}>
                <h2 className={styles.cardTitle}>{t("recentMatches")}</h2>
                <MatchesTable
                  matches={matches}
                  labels={labels}
                  locale={locale}
                  caption={
                    matches.length > RECENT_LIMIT
                      ? t("showingRecent", {
                          shown: RECENT_LIMIT,
                          total: matches.length,
                        })
                      : undefined
                  }
                  headers={{
                    opponent: t("opponent"),
                    result: t("result"),
                    date: t("date"),
                  }}
                />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

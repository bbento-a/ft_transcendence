"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import RequireAuth from "../components/requireAuth";
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
} from "./lib";
import {
  StatTiles,
  ResultPie,
  GamesBar,
  WinRateLine,
  MatchesTable,
  DifficultyTable,
} from "./components";

// Presets de intervalo mostrados como botoes, por ordem.
const PRESETS: PresetKey[] = ["all", "7d", "30d", "90d", "mtd"];
// Modos: todos / vs jogador / vs bot.
const MODES: GameMode[] = ["all", "player", "bot"];

function DashboardPage() {
  const t = useTranslations("dashboard");
  const router = useRouter();

  const [preset, setPreset] = useState<PresetKey>("all");
  // Intervalo personalizado (inputs de data). Quando preenchido, ganha ao preset.
  const [custom, setCustom] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Modo de adversario. Filtra-se no cliente (temos ja todas as partidas), por
  // isso trocar de modo e instantaneo — nao refaz o pedido ao backend.
  const [mode, setMode] = useState<GameMode>("all");

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

  // Busca UMA vez todas as partidas do utilizador. Os filtros (datas e modo)
  // sao todos aplicados no cliente, por isso trocar de preset/intervalo nao faz
  // pedidos novos — instantaneo e sem risco de bater no rate limit do backend.
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/stats/me`);
      if (!res.ok) throw new Error("bad status");
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Partidas apos aplicar o intervalo de datas E o modo (all / player / bot).
  // Base de tudo o que se ve nos graficos.
  const matches = useMemo(() => {
    if (!data) return [];
    return filterByMode(filterByDateRange(data.matches, range), mode);
  }, [data, range, mode]);

  // Dados derivados para cada grafico, todos a partir do conjunto ja filtrado.
  const totals = useMemo(() => computeTotals(matches), [matches]);
  const pieData = useMemo(() => toPieData(totals, labels), [totals, labels]);
  const dayData = useMemo(() => groupByDay(matches), [matches]);
  const rateData = useMemo(() => winRateSeries(matches), [matches]);
  // Analise por dificuldade so faz sentido no modo bot.
  const diffStats = useMemo(
    () => (mode === "bot" ? difficultyBreakdown(matches) : []),
    [mode, matches],
  );
  const winRatePct =
    totals.total > 0 ? Math.round((totals.wins / totals.total) * 100) : 0;

  const hasMatches = matches.length > 0;

  return (
    <div className={styles.pageWrapper}>
      {/* Botao voltar, igual ao das settings */}
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
              onChange={(e) =>
                setCustom((c) => ({ ...c, from: e.target.value }))
              }
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

        {/* Estados: carregar / erro / sem jogos / conteudo */}
        {loading ? (
          <div className={styles.stateMsg}>{t("loading")}</div>
        ) : error ? (
          <div className={styles.stateMsg}>{t("error")}</div>
        ) : !hasMatches ? (
          <div className={styles.stateMsg}>{t("empty")}</div>
        ) : (
          <>
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

// Envolve em RequireAuth como as outras paginas protegidas (evita flash de
// conteudo antes do refresh() inicial da sessao).
export default function Page() {
  return (
    <RequireAuth>
      <DashboardPage />
    </RequireAuth>
  );
}

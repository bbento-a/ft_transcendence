"use client";

/*
  Componentes apresentacionais do dashboard. Cada um recebe dados ja tratados
  (ver lib.ts) e rotulos ja traduzidos (i18n), por isso nao sabem nada de fetch
  nem de traducoes — so desenham. Os graficos usam Recharts.
*/

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Link } from "next-view-transitions";
import styles from "./page.module.css";
import {
  DayBucket,
  DifficultyKey,
  DifficultyStat,
  MatchRow,
  RESULT_COLORS,
  ResultKind,
  StatsResponse,
  WinRatePoint,
} from "./lib";

// Cor da tinta/grelha alinhada com o tema verde do app (nao com a cor das series).
const INK = "#426340";
const AXIS = "rgba(66, 99, 64, 0.55)";
const GRID = "rgba(66, 99, 64, 0.12)";

// Caixa do tooltip, partilhada por todos os graficos.
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: `1px solid ${INK}`,
  background: "#ffffff",
  color: INK,
  fontWeight: 600,
} as const;

// ---- Cartoes de resumo (numeros grandes) ----

type Labels = Record<ResultKind, string>;

export function StatTiles({
  totals,
  labels,
  winRatePct,
  totalLabel,
  winRateLabel,
}: {
  totals: StatsResponse["totals"];
  labels: Labels;
  winRatePct: number;
  totalLabel: string;
  winRateLabel: string;
}) {
  const tiles = [
    { label: totalLabel, value: totals.total, color: INK },
    { label: labels.win, value: totals.wins, color: RESULT_COLORS.win },
    { label: labels.loss, value: totals.losses, color: RESULT_COLORS.loss },
    { label: labels.draw, value: totals.draws, color: RESULT_COLORS.draw },
    { label: winRateLabel, value: `${winRatePct}%`, color: INK },
  ];
  return (
    <div className={styles.tilesRow}>
      {tiles.map((t) => (
        <div key={t.label} className={styles.tile}>
          <div className={styles.tileValue} style={{ color: t.color }}>
            {t.value}
          </div>
          <div className={styles.tileLabel}>{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Pie: distribuicao W/L/D ----

export function ResultPie({
  data,
}: {
  data: { key: string; name: string; value: number; color: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      {/* margem para os rotulos externos ("Wins: 12") nao cortarem em telas estreitas */}
      <PieChart margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="48%"
          outerRadius="70%"
          paddingAngle={2} // 2px de folga entre fatias
          stroke="#ffffff"
          strokeWidth={2}
          // rotulo direto com a contagem em cada fatia (codificacao secundaria)
          label={(entry: any) => `${entry.name}: ${entry.value}`}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---- Barras empilhadas: jogos por dia, divididos por resultado ----

export function GamesBar({
  data,
  labels,
}: {
  data: DayBucket[];
  labels: Labels;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        {/* preserveStartEnd + minTickGap: salta datas quando nao cabem (mobile) */}
        <XAxis
          dataKey="date"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: AXIS, fontSize: 12 }}
          width={28}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: GRID }} />
        <Legend />
        <Bar dataKey="win" name={labels.win} stackId="d" fill={RESULT_COLORS.win} />
        <Bar dataKey="loss" name={labels.loss} stackId="d" fill={RESULT_COLORS.loss} />
        <Bar
          dataKey="draw"
          name={labels.draw}
          stackId="d"
          fill={RESULT_COLORS.draw}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Linha: taxa de vitorias acumulada ao longo do tempo ----

export function WinRateLine({
  data,
  label,
}: {
  data: WinRatePoint[];
  label: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          domain={[0, 100]}
          unit="%"
          tick={{ fill: AXIS, fontSize: 12 }}
          width={40}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Line
          type="monotone"
          dataKey="winRate"
          name={label}
          stroke={INK}
          strokeWidth={2}
          dot={{ r: 3, fill: INK }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---- Tabela das partidas recentes----

// Quantas partidas a tabela mostra no maximo.
export const RECENT_LIMIT = 20;

export function MatchesTable({
  matches,
  labels,
  headers,
  locale,
  caption,
}: {
  matches: MatchRow[];
  labels: Labels;
  headers: { opponent: string; result: string; date: string };
  locale: string;
  caption?: string; // "A mostrar 20 de 137" — so quando ha mais que o limite
}) {
  // Mais recentes primeiro (o backend devolve por ordem crescente) e cortadas
  // no limite — a tabela e das RECENTES, nao do historico todo.
  const rows = [...matches].reverse().slice(0, RECENT_LIMIT);
  return (
    <div className={styles.tableWrap}>
      {caption && <div className={styles.tableCaption}>{caption}</div>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{headers.opponent}</th>
            <th>{headers.result}</th>
            <th>{headers.date}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => {
            const kind = m.result as ResultKind;
            // So adversarios humanos (com opponentId) tem dashboard; o Bot nao.
            const linkable = m.opponentId !== null;
            return (
              <tr key={i}>
                <td>
                  {linkable ? (
                    <Link
                      href={`/dashboard/${encodeURIComponent(m.opponent)}`}
                      className={styles.opponentLink}
                    >
                      {m.opponent}
                    </Link>
                  ) : (
                    m.opponent
                  )}
                </td>
                <td>
                  <span
                    className={styles.resultBadge}
                    style={{ background: RESULT_COLORS[kind] ?? INK }}
                  >
                    {labels[kind] ?? m.result}
                  </span>
                </td>
                <td className={styles.tableDate}>
                  {new Date(m.createdAt).toLocaleDateString(locale)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- Analise por dificuldade do bot ----
// Uma linha por nivel jogado: jogos, W/L/D, taxa de vitorias e — o mais fixe —
// quantas tentativas custou a primeira vitoria nesse nivel.

export function DifficultyTable({
  stats,
  difficultyLabels,
  headers,
  notBeaten,
}: {
  stats: DifficultyStat[];
  difficultyLabels: Record<DifficultyKey, string>;
  headers: {
    difficulty: string;
    games: string;
    record: string;
    winRate: string;
    firstWin: string;
  };
  notBeaten: string;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{headers.difficulty}</th>
            <th>{headers.games}</th>
            <th>{headers.record}</th>
            <th>{headers.winRate}</th>
            <th>{headers.firstWin}</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.difficulty}>
              <td>{difficultyLabels[s.difficulty]}</td>
              <td className={styles.tableDate}>{s.games}</td>
              <td className={styles.tableDate}>
                {s.wins}/{s.losses}/{s.draws}
              </td>
              <td className={styles.tableDate}>{s.winRate}%</td>
              <td className={styles.tableDate}>
                {s.attemptsToFirstWin === null ? notBeaten : s.attemptsToFirstWin}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

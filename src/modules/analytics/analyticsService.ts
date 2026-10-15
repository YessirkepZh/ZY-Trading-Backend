import { pool } from '../../db/pool';
import type { AnalysisMetrics } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function computeMetrics(
  userId: number,
  periodFrom: string,
  periodTo: string,
): Promise<{ metrics: AnalysisMetrics; deals: Record<string, unknown>[] }> {

  const { rows: deals } = await pool.query(`
    SELECT
      id, strategy, direction, market_type,
      pass_road, atr_percent, entry_raw,
      deal_result, checklist_snapshot,
      payload, calc_result,
      created_at, closed_at, updated_at, entered_at
    FROM deals
    WHERE user_id = $3
      AND status = 'closed'
      AND created_at >= $1
      AND created_at <= $2
    ORDER BY created_at ASC
  `, [periodFrom, periodTo + ' 23:59:59', userId]);

  const closed = deals.filter(d => d['deal_result']);
  const wins   = closed.filter(d => d['deal_result'] === 'win');
  const winRate = closed.length > 0
    ? round2((wins.length / closed.length) * 100)
    : 0;

  // === PassRoad зоны ===
  const passRoadZones = {
    '0-20':  { count: 0, wins: 0 },
    '20-40': { count: 0, wins: 0 },
    '40-60': { count: 0, wins: 0 },
    '>60':   { count: 0, wins: 0 },
  };

  for (const deal of closed) {
    const pr = parseFloat(String(deal['pass_road'])) || 0;
    const zone = pr <= 20 ? '0-20' : pr <= 40 ? '20-40' : pr <= 60 ? '40-60' : '>60';
    passRoadZones[zone].count++;
    if (deal['deal_result'] === 'win') passRoadZones[zone].wins++;
  }

  const winRateByPassRoad = Object.fromEntries(
    Object.entries(passRoadZones).map(([k, v]) => [
      k,
      { count: v.count, winRate: v.count > 0 ? round2(v.wins / v.count * 100) : 0 },
    ])
  ) as AnalysisMetrics['winRateByPassRoad'];

  // === По стратегиям ===
  const strategyMap: Record<string, { total: number; wins: number }> = {};
  for (const deal of closed) {
    const s = String(deal['strategy']);
    if (!strategyMap[s]) strategyMap[s] = { total: 0, wins: 0 };
    strategyMap[s].total++;
    if (deal['deal_result'] === 'win') strategyMap[s].wins++;
  }
  const winRateByStrategy = Object.fromEntries(
    Object.entries(strategyMap).map(([k, v]) => [
      k,
      { total: v.total, wins: v.wins, winRate: round2(v.wins / v.total * 100) },
    ])
  );

  // === ATR% режимы ===
  const atrZones = {
    'low (<1.5%)':     { count: 0, wins: 0 },
    'medium (1.5-3%)': { count: 0, wins: 0 },
    'high (>3%)':      { count: 0, wins: 0 },
  };

  for (const deal of closed) {
    const ap = parseFloat(String(deal['atr_percent'])) || 0;
    const zone = ap < 1.5 ? 'low (<1.5%)' : ap <= 3 ? 'medium (1.5-3%)' : 'high (>3%)';
    atrZones[zone].count++;
    if (deal['deal_result'] === 'win') atrZones[zone].wins++;
  }

  const winRateByAtrPercent = Object.fromEntries(
    Object.entries(atrZones).map(([k, v]) => [
      k,
      { count: v.count, winRate: v.count > 0 ? round2(v.wins / v.count * 100) : 0 },
    ])
  ) as AnalysisMetrics['winRateByAtrPercent'];

  // === День недели ===
  const DAYS: Record<number, string> = { 0: 'Вс', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' };
  const dayMap: Record<string, { count: number; wins: number }> = {};
  for (const deal of closed) {
    const day = DAYS[new Date(deal['created_at'] as string).getDay()] ?? 'Вс';
    if (!dayMap[day]) dayMap[day] = { count: 0, wins: 0 };
    dayMap[day].count++;
    if (deal['deal_result'] === 'win') dayMap[day].wins++;
  }
  const winRateByDayOfWeek = Object.fromEntries(
    Object.entries(dayMap).map(([k, v]) => [
      k,
      { count: v.count, winRate: v.count > 0 ? round2(v.wins / v.count * 100) : 0 },
    ])
  );

  // === Чек-лист корреляция ===
  const checklistMap: Record<string, {
    label: string; type: string; count: number; wins: number;
  }> = {};

  for (const deal of closed) {
    const cl = deal['checklist_snapshot'] as {
      plus?: string[]; minus?: string[]; wait?: string[];
    } | null;
    if (!cl) continue;

    const process = (keys: string[], type: string) => {
      for (const key of keys) {
        if (!checklistMap[key]) {
          checklistMap[key] = { label: key, type, count: 0, wins: 0 };
        }
        checklistMap[key].count++;
        if (deal['deal_result'] === 'win') checklistMap[key].wins++;
      }
    };
    process(cl.plus  ?? [], 'plus');
    process(cl.minus ?? [], 'minus');
    process(cl.wait  ?? [], 'wait');
  }

  const checklistCorrelation = Object.entries(checklistMap)
    .map(([key, v]) => ({
      key,
      label: v.label,
      type: v.type as 'plus' | 'minus' | 'wait',
      count: v.count,
      winRate: round2(v.wins / v.count * 100),
    }))
    .filter(c => c.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // === Серии ===
  let afterLoss2Count = 0, afterLoss2Wins = 0;
  let afterWin3Count  = 0, afterWin3Wins  = 0;
  let streak = 0;

  for (let i = 1; i < closed.length; i++) {
    const cur = closed[i]?.['deal_result'] as string;

    if (streak < 0 && Math.abs(streak) >= 2) {
      afterLoss2Count++;
      if (cur === 'win') afterLoss2Wins++;
    }
    if (streak > 0 && streak >= 3) {
      afterWin3Count++;
      if (cur === 'win') afterWin3Wins++;
    }

    streak = cur === 'win' ? (streak > 0 ? streak + 1 : 1)
                           : (streak < 0 ? streak - 1 : -1);
  }

  // === Ratio анализ ===
  const ratios = closed
    .map(d => {
      const payload = d['payload'] as { ratio?: number } | null;
      return payload?.ratio ?? 3;
    })
    .filter(r => r > 0);

  const plannedAvg = ratios.length > 0
    ? round2(ratios.reduce((a, b) => a + b, 0) / ratios.length)
    : 3;

  const realRatios = closed
    .filter(d => d['deal_result'] === 'win' && d['calc_result'])
    .map(d => {
      const cr = d['calc_result'] as {
        entryPrice?: number;
        takeProfitDefault?: number;
        stopLossDefault?: number;
        entryPriceByStop?: number;
        takeProfitByStop?: number;
        stopLossByStop?: number;
      } | null;
      // The own-stop plan is what the trader executes, when one was set
      const entry = cr?.entryPriceByStop ?? cr?.entryPrice;
      const tp    = cr?.takeProfitByStop ?? cr?.takeProfitDefault;
      const sl    = cr?.stopLossByStop ?? cr?.stopLossDefault;
      if (!entry || !tp || !sl) return null;
      const riskReal   = Math.abs(entry - sl);
      const rewardReal = Math.abs(tp - entry);
      return riskReal > 0 ? round2(rewardReal / riskReal) : null;
    })
    .filter((r): r is number => r !== null);

  const realAvg = realRatios.length > 0
    ? round2(realRatios.reduce((a, b) => a + b, 0) / realRatios.length)
    : 0;

  // === Время от сигнала до входа ===
  const timeToEntryData = closed
    .filter(d => d['entered_at'] && d['created_at'])
    .map(d => {
      const diff = new Date(d['entered_at'] as string).getTime() - new Date(d['created_at'] as string).getTime();
      const hours = round2(diff / (1000 * 60 * 60));
      return { hours, result: d['deal_result'] as string };
    });

  const fast   = timeToEntryData.filter(d => d.hours <= 2);
  const medium = timeToEntryData.filter(d => d.hours > 2 && d.hours <= 24);
  const slow   = timeToEntryData.filter(d => d.hours > 24);

  const calcWR = (arr: typeof fast) =>
    arr.length > 0
      ? round2(arr.filter(d => d.result === 'win').length / arr.length * 100)
      : 0;

  // === Лучшая/худшая стратегия ===
  const stratEntries = Object.entries(winRateByStrategy)
    .filter(([, v]) => v.total >= 3);

  const bestStrategy  = [...stratEntries].sort((a, b) => b[1].winRate - a[1].winRate)[0]?.[0]  ?? '—';
  const worstStrategy = [...stratEntries].sort((a, b) => a[1].winRate - b[1].winRate)[0]?.[0] ?? '—';

  // === Главная ошибка ===
  const topMistakeEntry = checklistCorrelation
    .filter(c => c.type === 'minus')
    .sort((a, b) => a.winRate - b.winRate)[0];
  const topMistake = topMistakeEntry
    ? `${topMistakeEntry.label} (winRate ${topMistakeEntry.winRate}% при наличии)`
    : 'Недостаточно данных';

  const metrics: AnalysisMetrics = {
    totalDeals:    deals.length,
    closedDeals:   closed.length,
    winRate,
    winRateByPassRoad,
    winRateByStrategy,
    checklistCorrelation,
    winRateByDayOfWeek,
    winRateByAtrPercent,
    streakAnalysis: {
      afterLoss2plus: {
        count: afterLoss2Count,
        winRate: afterLoss2Count > 0 ? round2(afterLoss2Wins / afterLoss2Count * 100) : 0,
      },
      afterWin3plus: {
        count: afterWin3Count,
        winRate: afterWin3Count > 0 ? round2(afterWin3Wins / afterWin3Count * 100) : 0,
      },
    },
    ratioAnalysis: { plannedAvg, realAvg },
    timeToEntryAnalysis: {
      fast:   { label: '< 2 часов',  count: fast.length,   winRate: calcWR(fast) },
      medium: { label: '2-24 часа',  count: medium.length, winRate: calcWR(medium) },
      slow:   { label: '> 24 часов', count: slow.length,   winRate: calcWR(slow) },
    },
    bestStrategy,
    worstStrategy,
    topMistake,
  };

  return { metrics, deals };
}

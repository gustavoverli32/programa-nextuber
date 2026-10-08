import type { ProductionEntry } from "./production.ts";
import {
  getCurrentProductionDeadline,
  getWeekStartYmd,
  localYmd,
  type ProductionConfig,
} from "./production-deadline.ts";
import { productionRef } from "./production-view.ts";
import type { PlannerTuberProduct } from "./production-integration.ts";

type ProductLocation = { kind: "MOD" | "OUT"; itemIndex: number };

const PRODUCT_LOCATIONS: Record<PlannerTuberProduct, ProductLocation> = {
  inss: { kind: "MOD", itemIndex: 0 },
  op: { kind: "MOD", itemIndex: 1 },
  ep: { kind: "MOD", itemIndex: 2 },
  crediario: { kind: "MOD", itemIndex: 3 },
  seguros: { kind: "OUT", itemIndex: 0 },
  pic: { kind: "OUT", itemIndex: 1 },
  combinaqui: { kind: "OUT", itemIndex: 2 },
  engajamento: { kind: "OUT", itemIndex: 3 },
  consorcio: { kind: "OUT", itemIndex: 4 },
};

export type PlannerTuberDailyAmount = {
  estagiario_id: string;
  produto: string;
  quantidade: number | string | null;
};

export type PlannerTuberClosingWindow = {
  deadline: string;
  weekStart: string;
  quarterRef: string;
  monthIndex: number;
  weekIndex: number;
};

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPlannerTuberProduct(value: string): value is PlannerTuberProduct {
  return Object.hasOwn(PRODUCT_LOCATIONS, value);
}

export function getPlannerTuberClosingWindow(
  config: ProductionConfig | null | undefined,
  now = new Date(),
): PlannerTuberClosingWindow | null {
  const deadline = getCurrentProductionDeadline(config, now);
  if (localYmd(now) !== deadline) return null;

  const date = new Date(`${deadline}T12:00:00Z`);
  const month = date.getUTCMonth();
  return {
    deadline,
    weekStart: getWeekStartYmd(now),
    quarterRef: `${date.getUTCFullYear()}-Q${Math.floor(month / 3) + 1}`,
    monthIndex: (month % 3) + 1,
    weekIndex: Math.ceil(date.getUTCDate() / 7),
  };
}

export function groupPlannerTuberDailyAmounts(
  rows: PlannerTuberDailyAmount[],
  window: PlannerTuberClosingWindow,
) {
  const valuesByStudent = new Map<string, Map<PlannerTuberProduct, number>>();
  for (const row of rows) {
    if (!isPlannerTuberProduct(row.produto)) continue;
    const values = valuesByStudent.get(row.estagiario_id) ?? new Map<PlannerTuberProduct, number>();
    values.set(row.produto, (values.get(row.produto) ?? 0) + numberValue(row.quantidade));
    valuesByStudent.set(row.estagiario_id, values);
  }

  return new Map<string, ProductionEntry[]>(
    [...valuesByStudent.entries()].map(([studentId, values]) => [
      studentId,
      [...values.entries()].map(([product, value]) => {
        const location = PRODUCT_LOCATIONS[product];
        return {
          ref: productionRef(
            window.quarterRef,
            window.monthIndex,
            window.weekIndex,
            location.kind,
            location.itemIndex,
          ),
          value,
        };
      }),
    ]),
  );
}

export function markPlannerTuberProductionClosed(
  profile: Record<string, unknown> | null | undefined,
  deadline: string,
) {
  return {
    ...(profile ?? {}),
    ultima_atualizacao_prod: deadline,
    producao_verificada_prazo: deadline,
  };
}

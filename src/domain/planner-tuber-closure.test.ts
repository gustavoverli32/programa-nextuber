import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlannerTuberClosingWindow,
  groupPlannerTuberDailyAmounts,
  markPlannerTuberProductionClosed,
} from "./planner-tuber-closure.ts";

const atSaoPaulo = (ymd: string) => new Date(`${ymd}T15:15:00Z`);

test("closes the Friday production week on Friday in Sao Paulo", () => {
  const window = getPlannerTuberClosingWindow({}, atSaoPaulo("2026-10-09"));
  assert.deepEqual(window, {
    deadline: "2026-10-09",
    weekStart: "2026-10-05",
    quarterRef: "2026-Q4",
    monthIndex: 1,
    weekIndex: 2,
  });
  assert.equal(getPlannerTuberClosingWindow({}, atSaoPaulo("2026-10-10")), null);
});

test("sums daily Planner e Tuber results into the existing weekly cells", () => {
  const window = getPlannerTuberClosingWindow({}, atSaoPaulo("2026-10-09"))!;
  const grouped = groupPlannerTuberDailyAmounts([
    { estagiario_id: "student-1", produto: "inss", quantidade: 10000 },
    { estagiario_id: "student-1", produto: "inss", quantidade: 20000 },
    { estagiario_id: "student-1", produto: "seguros", quantidade: 4 },
    { estagiario_id: "student-2", produto: "engajamento", quantidade: 6 },
  ], window);

  assert.deepEqual(grouped.get("student-1"), [
    { ref: "2026-Q4-M1-S2-MOD0", value: 30000 },
    { ref: "2026-Q4-M1-S2-OUT0", value: 4 },
  ]);
  assert.deepEqual(grouped.get("student-2"), [
    { ref: "2026-Q4-M1-S2-OUT3", value: 6 },
  ]);
});

test("marks a Planner e Tuber weekly close as confirmed without removing profile data", () => {
  assert.deepEqual(
    markPlannerTuberProductionClosed({ funcional: "987368382", outro: true }, "2026-10-09"),
    {
      funcional: "987368382",
      outro: true,
      ultima_atualizacao_prod: "2026-10-09",
      producao_verificada_prazo: "2026-10-09",
    },
  );
});

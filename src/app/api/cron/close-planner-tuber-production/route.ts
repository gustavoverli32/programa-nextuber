import { getPlannerTuberClosingWindow, groupPlannerTuberDailyAmounts, markPlannerTuberProductionClosed } from "@/domain/planner-tuber-closure";
import { summarizeProduction, type ProductionRow } from "@/domain/production";
import { createSupabaseAdminClient, hasSupabaseServiceRoleKey } from "@/lib/supabase-server";
import { ensureProductionAuditForDeadline } from "@/server/production-audit";
import { loadProductionConfig } from "@/server/production-context";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ActiveStudent = { id: string; perfil: Json | null };

function numericValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Nao autorizado." }, { status: 401 });
  }
  if (!hasSupabaseServiceRoleKey()) {
    return Response.json({ error: "Servico de producao indisponivel." }, { status: 503 });
  }

  try {
    const now = new Date();
    const supabase = createSupabaseAdminClient();
    const config = await loadProductionConfig(supabase);
    const window = getPlannerTuberClosingWindow(config, now);
    if (!window) {
      return Response.json({ skipped: true, reason: "Fora da data de fechamento semanal." });
    }

    const { data: dailyRows, error: dailyRowsError } = await supabase
      .from("planner_tuber_producao_diaria")
      .select("estagiario_id,produto,quantidade")
      .gte("data_referencia", window.weekStart)
      .lte("data_referencia", window.deadline);
    if (dailyRowsError) throw dailyRowsError;

    const entriesByStudent = groupPlannerTuberDailyAmounts(dailyRows ?? [], window);
    const studentIds = [...entriesByStudent.keys()];
    let studentsById = new Map<string, ActiveStudent>();
    if (studentIds.length) {
      const { data: students, error: studentsError } = await supabase
        .from("estagiarios")
        .select("id,perfil")
        .is("arquivado_em", null)
        .in("id", studentIds);
      if (studentsError) throw studentsError;
      studentsById = new Map((students ?? []).map((student) => [student.id, student as ActiveStudent]));
    }

    let studentsClosed = 0;
    for (const [studentId, entries] of entriesByStudent) {
      const student = studentsById.get(studentId);
      if (!student || !entries.length) continue;

      const { error: saveEntriesError } = await supabase.from("producao_trimestral").upsert(
        entries.map((entry) => ({
          estagiario_id: studentId,
          tri_ref: entry.ref,
          meta: 0,
          producao: entry.value,
        })),
        { onConflict: "estagiario_id,tri_ref" },
      );
      if (saveEntriesError) throw saveEntriesError;

      const { data: productionRows, error: rowsError } = await supabase
        .from("producao_trimestral")
        .select("estagiario_id,tri_ref,meta,producao")
        .eq("estagiario_id", studentId)
        .like("tri_ref", `${window.quarterRef}%`);
      if (rowsError) throw rowsError;

      const rows = (productionRows ?? []) as ProductionRow[];
      const target = numericValue(rows.find((row) => row.tri_ref === window.quarterRef)?.meta);
      const summary = summarizeProduction(rows, window.quarterRef, target);
      const { error: aggregateError } = await supabase.from("producao_trimestral").upsert(
        {
          estagiario_id: studentId,
          tri_ref: window.quarterRef,
          meta: target,
          producao: summary.credit,
        },
        { onConflict: "estagiario_id,tri_ref" },
      );
      if (aggregateError) throw aggregateError;

      const { error: snapshotError } = await supabase.from("snapshots").upsert(
        {
          estagiario_id: studentId,
          tri_ref: window.quarterRef,
          score: summary.score,
          score_producao: summary.creditScore,
          score_trilha: summary.productsScore,
          total_producao: summary.total,
          meta: target,
        },
        { onConflict: "estagiario_id,tri_ref" },
      );
      if (snapshotError) throw snapshotError;

      const { error: profileError } = await supabase
        .from("estagiarios")
        .update({
          perfil: markPlannerTuberProductionClosed(
            (student.perfil ?? {}) as Record<string, unknown>,
            window.deadline,
          ) as Json,
        })
        .eq("id", studentId);
      if (profileError) throw profileError;
      studentsClosed += 1;
    }

    const auditHistory = await ensureProductionAuditForDeadline(
      supabase,
      window.deadline,
      now.toISOString(),
    );
    await supabase.from("configuracoes").upsert({
      id: "integracao_planner_tuber_fechamento",
      valor: {
        deadline: window.deadline,
        weekStart: window.weekStart,
        quarterRef: window.quarterRef,
        studentsClosed,
        closedAt: now.toISOString(),
      },
    });

    return Response.json({
      ok: true,
      deadline: window.deadline,
      studentsClosed,
      pendingStudents: auditHistory.find((entry) => entry.deadline === window.deadline)?.pending.length ?? 0,
    });
  } catch (error) {
    console.error("Falha no fechamento Planner e Tuber:", error);
    return Response.json(
      { error: "Falha ao fechar a producao semanal da Planner e Tuber." },
      { status: 500 },
    );
  }
}

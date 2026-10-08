import { timingSafeEqual } from "node:crypto";
import { parsePlannerTuberProductionPayload } from "@/domain/production-integration";
import { createSupabaseAdminClient, hasSupabaseServiceRoleKey } from "@/lib/supabase-server";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StudentRow = { id: string; perfil: Json | null };

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function integrationApiKey(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get("x-api-key")?.trim() || "";
}

function profileFunctional(profile: Json | null) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return "";
  return String((profile as Record<string, Json | undefined>).funcional ?? "").replace(/\D/g, "");
}

export async function POST(request: Request) {
  const expectedKey = process.env.NEXTUBER_PRODUCTION_IMPORT_API_KEY;
  if (!expectedKey || !hasSupabaseServiceRoleKey()) {
    return Response.json(
      { error: "Integracao de producao ainda nao configurada." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!secureEquals(integrationApiKey(request), expectedKey)) {
    return Response.json(
      { error: "Nao autorizado." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const payload = parsePlannerTuberProductionPayload(await request.json().catch(() => null));
    const supabase = createSupabaseAdminClient();
    const functionals = payload.records.map((item) => item.funcional);
    const { data: studentRows, error: studentsError } = await supabase
      .from("estagiarios")
      .select("id,perfil")
      .is("arquivado_em", null)
      .in("perfil->>funcional", functionals);
    if (studentsError) throw studentsError;

    const studentsByFunctional = new Map(
      ((studentRows ?? []) as StudentRow[]).map((student) => [profileFunctional(student.perfil), student]),
    );
    const unknownFunctionals = functionals.filter((functional) => !studentsByFunctional.has(functional));
    if (unknownFunctionals.length) {
      return Response.json(
        { error: "Existem funcionais nao encontrados entre estagiarios ativos.", unknownFunctionals },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    const dailyRows = payload.records.flatMap((record) => {
      const student = studentsByFunctional.get(record.funcional)!;
      return record.products.map((product) => ({
        estagiario_id: student.id,
        evento_id: payload.eventId,
        data_referencia: record.referenceDate,
        produto: product.product,
        produto_origem: product.sourceProduct,
        quantidade: product.amount,
        nome_origem: record.name,
      }));
    });
    const { error: upsertError } = await supabase
      .from("planner_tuber_producao_diaria")
      .upsert(dailyRows, { onConflict: "evento_id,estagiario_id,produto" });
    if (upsertError) throw upsertError;

    await supabase.from("configuracoes").upsert({
      id: "integracao_planner_tuber_status",
      valor: {
        source: payload.source,
        lastEventId: payload.eventId,
        lastReceivedAt: new Date().toISOString(),
        sourceSentAt: payload.sentAt,
        recordsReceived: payload.records.length,
        productsReceived: dailyRows.length,
      },
    });

    return Response.json(
      { ok: true, eventId: payload.eventId, recordsReceived: payload.records.length, productsReceived: dailyRows.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Falha na integracao Planner e Tuber:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao receber producao." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

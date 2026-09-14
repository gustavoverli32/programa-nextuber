import { parseStudentMutation } from "@/domain/admin-mutations";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import {
  assertSameOrigin,
  ProductionHttpError,
  productionErrorResponse,
  requireProductionSession,
  requireTutorOrStudentRegistrar,
} from "@/server/production-access";
import type { Json } from "@/types/database";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireProductionSession();
    const input = parseStudentMutation(await request.json().catch(() => null));
    const supabase = createSupabaseAdminClient();
    const manager = await requireTutorOrStudentRegistrar(supabase, session);

    const employeeCode = String((input.profile as Record<string, Json>).funcional ?? "");
    const { data: duplicate, error: duplicateError } = await supabase
      .from("estagiarios")
      .select("id")
      .eq("perfil->>funcional", employeeCode)
      .limit(1)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new ProductionHttpError("Ja existe um estagiario com este funcional.", 409);

    let defaultRegionalId: string | null = null;
    let profile = input.profile;
    if (session.role === "gestor") {
      if (!manager) throw new ProductionHttpError("Gestor nao encontrado.", 403);
      defaultRegionalId = manager.regional_id ?? null;
      if (!defaultRegionalId) {
        throw new ProductionHttpError("Gestor sem regional vinculada.", 403);
      }
      if (input.regionalId && input.regionalId !== defaultRegionalId) {
        throw new ProductionHttpError("Gestores só podem cadastrar estagiários na própria regional.", 403);
      }
      if (manager.tipo_gestor === "ga") {
        profile = {
          ...(input.profile as Record<string, Json>),
          ga_funcional: manager.funcional,
        } as Json;
      }
    }

    const { data, error } = await supabase
      .from("estagiarios")
      .insert({
        nome: input.name,
        meses: input.months,
        obs: input.notes,
        atencao: input.attention,
        perfil: profile,
        trilha_checks: input.trailChecks,
        regional_id: defaultRegionalId || input.regionalId,
      })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ student: data }, { status: 201 });
  } catch (error) {
    return productionErrorResponse(error);
  }
}

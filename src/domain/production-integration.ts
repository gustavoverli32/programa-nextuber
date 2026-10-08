export const PLANNER_TUBER_INTEGRATION_VERSION = "2026-10-07";

const FUNCTIONAL_PATTERN = /^\d{9}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 1_000_000_000_000;

export const PLANNER_TUBER_PRODUCTS = [
  "inss", "op", "ep", "crediario", "seguros", "pic", "combinaqui", "engajamento", "consorcio",
] as const;

export type PlannerTuberProduct = (typeof PLANNER_TUBER_PRODUCTS)[number];

export type PlannerTuberDailyProduct = {
  product: PlannerTuberProduct;
  sourceProduct: string;
  amount: number;
};

export type PlannerTuberDailyRecord = {
  funcional: string;
  name: string | null;
  referenceDate: string;
  products: PlannerTuberDailyProduct[];
};

export type PlannerTuberProductionPayload = {
  eventId: string;
  source: "Planner e Tuber";
  sentAt: string;
  records: PlannerTuberDailyRecord[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Carga da Planner e Tuber invalida.");
  }
  return value as Record<string, unknown>;
}

function cleanFunctional(value: unknown) {
  const functional = String(value ?? "").replace(/\D/g, "");
  if (!FUNCTIONAL_PATTERN.test(functional)) {
    throw new Error("Funcional invalido na integracao.");
  }
  return functional;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizePlannerTuberProduct(value: unknown): PlannerTuberProduct {
  const source = String(value ?? "").trim();
  const normalized = normalizeText(source);

  if (normalized.includes("inss")) return "inss";
  if (normalized === "op" || normalized.includes("operacao pessoal")) return "op";
  if (normalized === "ep" || normalized.includes("emprestimo pessoal") || normalized.includes("credito pessoal")) return "ep";
  if (normalized.includes("creditario")) return "crediario";
  if (normalized.includes("seguro")) return "seguros";
  if (normalized === "pic") return "pic";
  if (normalized.includes("combinaqui")) return "combinaqui";
  if (normalized.includes("engajamento")) return "engajamento";
  if (normalized.includes("consorcio")) return "consorcio";

  throw new Error(`Produto nao reconhecido na integracao: ${source || "vazio"}.`);
}

function parseDate(value: unknown, sentAt: string) {
  const candidate = String(value ?? sentAt.slice(0, 10));
  if (!DATE_PATTERN.test(candidate) || Number.isNaN(Date.parse(`${candidate}T12:00:00Z`))) {
    throw new Error("Data de referencia invalida na integracao.");
  }
  return candidate;
}

function parseProducts(value: unknown): PlannerTuberDailyProduct[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new Error("Cada estagiario precisa ter ao menos um produto informado.");
  }

  const parsed = value.map((item) => {
    const source = asRecord(item);
    const sourceProduct = String(source.product ?? source.produto ?? "").trim();
    const amount = source.amount ?? source.valor ?? source.quantidade;
    if (!sourceProduct) throw new Error("Produto invalido na integracao.");
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
      throw new Error(`Quantidade invalida para ${sourceProduct}.`);
    }
    return { product: normalizePlannerTuberProduct(sourceProduct), sourceProduct, amount };
  });

  const products = new Set<string>();
  for (const item of parsed) {
    if (products.has(item.product)) {
      throw new Error("O mesmo produto nao pode aparecer duas vezes para o mesmo estagiario.");
    }
    products.add(item.product);
  }
  return parsed;
}

function parseDailyRecord(value: unknown, sentAt: string): PlannerTuberDailyRecord {
  const source = asRecord(value);
  const name = String(source.nome ?? source.name ?? "").trim();
  return {
    funcional: cleanFunctional(source.funcional),
    name: name || null,
    referenceDate: parseDate(source.referenceDate ?? source.dataReferencia, sentAt),
    products: parseProducts(source.products ?? source.produtos),
  };
}

export function parsePlannerTuberProductionPayload(body: unknown): PlannerTuberProductionPayload {
  const source = asRecord(body);
  const eventId = String(source.eventId ?? "").trim();
  const provider = normalizeText(String(source.source ?? ""));
  const sentAt = String(source.sentAt ?? "");
  if (!eventId || eventId.length > 160) throw new Error("Identificador do evento invalido.");
  if (provider !== "planner e tuber") throw new Error("Origem da integracao invalida.");
  if (Number.isNaN(Date.parse(sentAt))) throw new Error("Data de envio invalida.");
  if (!Array.isArray(source.records) || source.records.length === 0 || source.records.length > 250) {
    throw new Error("Lista de producoes invalida.");
  }

  const records = source.records.map((item) => parseDailyRecord(item, sentAt));
  const seen = new Set<string>();
  for (const item of records) {
    const key = `${item.funcional}:${item.referenceDate}`;
    if (seen.has(key)) throw new Error("O mesmo estagiario nao pode aparecer duas vezes no mesmo dia.");
    seen.add(key);
  }
  return { eventId, source: "Planner e Tuber", sentAt, records };
}

import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlannerTuberProduct, parsePlannerTuberProductionPayload } from "./production-integration.ts";

test("validates the Planner e Tuber daily payload and maps partner labels", () => {
  const parsed = parsePlannerTuberProductionPayload({
    eventId: "planner-2026-10-07-4261",
    source: "Planner e Tuber",
    sentAt: "2026-10-07T21:00:00-03:00",
    records: [{
      funcional: "987.368.382",
      nome: "Gustavo",
      referenceDate: "2026-10-07",
      products: [
        { product: "Crédito consignado INSS", amount: 10000 },
        { product: "Seguro", amount: 1000 },
        { product: "Engajamento", amount: 6 },
      ],
    }],
  });
  assert.equal(parsed.records[0].funcional, "987368382");
  assert.equal(parsed.records[0].name, "Gustavo");
  assert.equal(parsed.records[0].referenceDate, "2026-10-07");
  assert.deepEqual(parsed.records[0].products, [
    { product: "inss", sourceProduct: "Crédito consignado INSS", amount: 10000 },
    { product: "seguros", sourceProduct: "Seguro", amount: 1000 },
    { product: "engajamento", sourceProduct: "Engajamento", amount: 6 },
  ]);
});

test("uses the send date when the daily reference is not supplied", () => {
  const parsed = parsePlannerTuberProductionPayload({
    eventId: "planner-2026-10-08-4261",
    source: "Planner e Tuber",
    sentAt: "2026-10-08T21:00:00-03:00",
    records: [{ funcional: "987368382", products: [{ produto: "PIC", quantidade: 3 }] }],
  });
  assert.equal(parsed.records[0].referenceDate, "2026-10-08");
  assert.equal(parsed.records[0].products[0].product, "pic");
  assert.equal(normalizePlannerTuberProduct("Consórcio"), "consorcio");
});

test("rejects unsafe, duplicated, or unknown Planner e Tuber data", () => {
  assert.throws(() => parsePlannerTuberProductionPayload({ eventId: "", records: [] }), /Identificador do evento invalido/);
  assert.throws(() => parsePlannerTuberProductionPayload({
    eventId: "evt-1", source: "Planner e Tuber", sentAt: "2026-10-07T21:00:00Z",
    records: [{ funcional: "987368382", products: [{ product: "Seguro", amount: 1 }, { product: "Seguros", amount: 2 }] }],
  }), /mesmo produto/);
  assert.throws(() => normalizePlannerTuberProduct("Produto desconhecido"), /nao reconhecido/);
});

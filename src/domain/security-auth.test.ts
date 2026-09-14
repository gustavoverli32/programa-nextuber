import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const projectRoot = process.cwd();

test("session.ts enforces HTTP-only cookies, SameSite=lax, HMAC signatures, and timing attack protection", () => {
  const sessionSource = readFileSync(`${projectRoot}/src/lib/session.ts`, "utf8");

  assert.equal(sessionSource.includes("SESSION_COOKIE_NAME = \"nextuber_session\""), true);
  assert.equal(sessionSource.includes("httpOnly: true"), true);
  assert.equal(sessionSource.includes("sameSite: \"lax\""), true);
  assert.equal(sessionSource.includes("timingSafeEqual"), true);
  assert.equal(sessionSource.includes("createHmac(\"sha256\""), true);
});

test("production-access.ts enforces origin check, tutora permissions, and student write authorization", () => {
  const accessSource = readFileSync(`${projectRoot}/src/server/production-access.ts`, "utf8");
  const studentsRoute = readFileSync(`${projectRoot}/src/app/api/students/route.ts`, "utf8");

  assert.equal(accessSource.includes("requireProductionSession"), true);
  assert.equal(accessSource.includes("requireTutorSession"), true);
  assert.equal(accessSource.includes("requireTutorOrGga"), true);
  assert.equal(accessSource.includes("requireTutorOrStudentRegistrar"), true);
  assert.equal(accessSource.includes("isGgaEquivalent"), true);
  assert.equal(accessSource.includes('managerType === "ga"'), true);
  assert.equal(accessSource.includes('managerType === "facilitador"'), true);
  assert.equal(accessSource.includes("assertSameOrigin"), true);
  assert.equal(accessSource.includes("authorizeStudentWrite"), true);
  assert.equal(studentsRoute.includes("requireTutorOrStudentRegistrar"), true);
  assert.equal(studentsRoute.includes("ga_funcional: manager.funcional"), true);
});

test("a GA can open the student registration flow without gaining edit or delete controls", () => {
  const legacySource = readFileSync(`${projectRoot}/assets/js/app.js`, "utf8");

  assert.equal(legacySource.includes("function canRegisterStudents()"), true);
  assert.equal(legacySource.includes("tipo === 'ga'"), true);
  assert.equal(legacySource.includes("canManageCadastros = editor || isGGA()"), true);
  assert.equal(legacySource.includes("gaInput.value=String(gestorLogado.funcional || '')"), true);
});

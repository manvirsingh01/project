import test from "node:test";
import assert from "node:assert/strict";
import { documentMap, projectSources, researchTools, sourceCrosswalk, standards, technologies, worksCited } from "../benchmark-data/references.js";

test("reference index covers the source report's categories and project documents", () => {
  assert.equal(projectSources.length, 2);
  assert.equal(standards.length, 6);
  assert.ok(researchTools.filter((tool) => tool.name !== "Wokwi").every((tool) => /not integrated|not used|out of scope/i.test(tool.integration)));
  assert.match(researchTools.find((tool) => tool.name === "Wokwi").integration, /local .*projects are included/i);
  assert.equal(worksCited.length, 18);
  assert.ok(sourceCrosswalk.length >= 5);
  assert.ok(technologies.some((technology) => technology.name === "Node.js + native ES modules" && technology.status === "Used"));
  assert.ok(technologies.some((technology) => technology.name === "TypeScript" && /Not integrated/.test(technology.status)));
  assert.ok(documentMap.some(([file]) => file === "08-REFERENCES.md"));
  assert.ok(documentMap.some(([file]) => file === "09-DATA-EXPORT.md"));
  assert.ok(documentMap.some(([file]) => file === "11-WOKWI-SIMULATION.md"));
});

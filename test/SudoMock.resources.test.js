const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { NodeHelpers } = require("n8n-workflow");
const { SudoMock } = require("../dist/nodes/SudoMock/SudoMock.node");
const {
  SudoMockTrigger,
} = require("../dist/nodes/SudoMock/SudoMockTrigger.node");
const {
  WEBHOOK_EVENT_NAMING_OPTIONS,
} = require("../dist/nodes/SudoMock/webhooks");

const description = new SudoMock().description;
const properties = description.properties;
const expectedOperations = {
  account: ["getAccountInfo"],
  artwork: ["deleteArtworks"],
  font: ["deleteFont", "getFont", "listFonts", "uploadFont"],
  image: ["removeBackground"],
  job: ["getJob", "listJobs"],
  photoMockup: [
    "create2DMockup",
    "delete2DMockup",
    "get2DMockup",
    "list2DMockups",
    "render2DMockup",
    "set2DPrintAreas",
  ],
  psdMockup: [
    "deleteMockup",
    "getMockup",
    "getMockupLayers",
    "listMockups",
    "render",
    "updateMockup",
    "uploadPsd",
  ],
  video: ["renderVideo"],
  webhook: [
    "webhookCreate",
    "webhookDelete",
    "webhookEventsFeed",
    "webhookGet",
    "webhookListDeliveries",
    "webhookList",
    "webhookReplayDelivery",
    "webhookReplayFailed",
    "webhookRotateSecret",
    "webhookTest",
    "webhookUpdate",
  ],
};

function node(typeVersion, parameters = {}) {
  return {
    id: "test",
    name: "SudoMock",
    type: "n8n-nodes-sudomock.sudoMock",
    typeVersion,
    position: [0, 0],
    parameters,
  };
}

function normalize(typeVersion, parameters = {}) {
  return NodeHelpers.getNodeParameters(
    properties,
    parameters,
    true,
    false,
    node(typeVersion, parameters),
    description,
  );
}

function visibleProperties(typeVersion, parameters) {
  return properties.filter((property) =>
    NodeHelpers.displayParameter(
      parameters,
      property,
      node(typeVersion, parameters),
      description,
    ),
  );
}

test("new nodes group all 34 operations exactly once, with one visible selector per resource", async (t) => {
  assert.deepEqual(description.version, [1, 2]);
  const resource = properties.find((property) => property.name === "resource");
  assert.equal(resource.noDataExpression, true);
  assert.equal(resource.default, "psdMockup");
  assert.deepEqual(
    resource.options.map((option) => option.value),
    Object.keys(expectedOperations),
  );
  assert.deepEqual(
    resource.options.map((option) => option.name),
    [
      "Account",
      "Artwork",
      "Font",
      "Image",
      "Job",
      "Photo Mockup",
      "PSD Mockup",
      "Video",
      "Webhook",
    ],
  );
  const allOperations = Object.values(expectedOperations).flat();
  assert.equal(allOperations.length, 34);
  assert.equal(new Set(allOperations).size, 34);

  for (const [resourceName, operations] of Object.entries(expectedOperations)) {
    await t.test(resourceName, () => {
      const parameters = normalize(2, { resource: resourceName });
      const visible = visibleProperties(2, parameters);
      assert.equal(
        visible.filter((property) => property.name === "resource").length,
        1,
      );
      const selectors = visible.filter(
        (property) => property.name === "operation",
      );
      assert.equal(selectors.length, 1);
      assert.deepEqual(
        selectors[0].options.map((option) => option.value),
        operations,
      );
      assert.ok(
        operations.includes(parameters.operation),
        "resource default must be a valid operation",
      );
      assert.ok(
        selectors[0].options.every(
          (option) => option.action && option.description,
        ),
      );
    });
  }
  assert.equal(normalize(2).operation, "render");
});

test("legacy nodes keep all operation values and normalized fields without acquiring a resource", async (t) => {
  for (const [resource, operations] of Object.entries(expectedOperations)) {
    for (const operation of operations) {
      await t.test(operation, () => {
        const legacy = normalize(1, { operation });
        assert.equal(legacy.operation, operation);
        assert.equal(Object.hasOwn(legacy, "resource"), false);
        const visible = visibleProperties(1, legacy);
        assert.equal(
          visible.filter((property) => property.name === "resource").length,
          0,
        );
        const selectors = visible.filter(
          (property) => property.name === "operation",
        );
        assert.equal(selectors.length, 1);
        assert.equal(selectors[0].options.length, 34);
        const { resource: selectedResource, ...current } = normalize(2, {
          ...legacy,
          resource,
        });
        assert.equal(selectedResource, resource);
        assert.deepEqual(current, legacy);
      });
    }
  }
});

test("saved workflow examples retain nested and non-default parameters in both node versions", () => {
  let count = 0;
  for (const folder of ["examples", "demos"]) {
    for (const filename of fs.readdirSync(path.join(__dirname, "..", folder))) {
      if (!filename.endsWith(".json")) continue;
      const workflow = JSON.parse(
        fs.readFileSync(path.join(__dirname, "..", folder, filename), "utf8"),
      );
      for (const savedNode of workflow.nodes ?? []) {
        if (savedNode.type !== "n8n-nodes-sudomock.sudoMock") continue;
        assert.equal(savedNode.typeVersion, 1);
        const legacy = normalize(1, savedNode.parameters);
        const resource = Object.keys(expectedOperations).find((key) =>
          expectedOperations[key].includes(legacy.operation),
        );
        assert.ok(resource, `unknown operation in ${filename}`);
        const { resource: selectedResource, ...current } = normalize(2, {
          ...savedNode.parameters,
          resource,
        });
        assert.equal(selectedResource, resource);
        assert.deepEqual(current, legacy, `${filename}: ${savedNode.name}`);
        count++;
      }
    }
  }
  assert.ok(count > 0, "must check real saved workflows");
});

test("both nodes ship distinct light and dark icons and keep their AI-tool behavior", () => {
  for (const nodeDescription of [
    description,
    new SudoMockTrigger().description,
  ]) {
    assert.deepEqual(nodeDescription.icon, {
      light: "file:sudomock.svg",
      dark: "file:sudomock.dark.svg",
    });
    const light = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "dist/nodes/SudoMock",
        nodeDescription.icon.light.slice(5),
      ),
      "utf8",
    );
    const dark = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "dist/nodes/SudoMock",
        nodeDescription.icon.dark.slice(5),
      ),
      "utf8",
    );
    assert.notEqual(light, dark);
    assert.match(dark, /fill="#f8fafc"/);
    assert.match(dark, /fill="#334155"/);
  }
  assert.equal(description.usableAsTool, true);
  assert.equal(new SudoMockTrigger().description.usableAsTool, undefined);
});

test("legacy webhook naming help ends with a period", () => {
  assert.ok(
    WEBHOOK_EVENT_NAMING_OPTIONS.find(
      (option) => option.value === "legacy",
    ).description.endsWith("."),
  );
});

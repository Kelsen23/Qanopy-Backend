import { describe, expect, it } from "vitest";

import { appStageConfigSchema } from "../../../../src/validations/config/appStage.schema.js";

describe("appStageConfigSchema", () => {
  it("defaults STAGE to DEMO when it is not provided", () => {
    expect(appStageConfigSchema.parse({})).toEqual({
      registrationStage: "DEMO",
    });
  });

  it("rejects invalid STAGE values", () => {
    expect(() => appStageConfigSchema.parse({ STAGE: "FULL_RELEASE" })).toThrow(
      "Invalid app stage",
    );
  });
});

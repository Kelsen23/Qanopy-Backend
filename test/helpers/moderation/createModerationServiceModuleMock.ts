import { vi } from "vitest";

type ModerationServiceModuleMockOverrides = Partial<{
  createReport: ReturnType<typeof vi.fn>;
  moderate: ReturnType<typeof vi.fn>;
  getBan: ReturnType<typeof vi.fn>;
  unbanUser: ReturnType<typeof vi.fn>;
}>;

export const createModerationServiceModuleMock = (
  overrides: ModerationServiceModuleMockOverrides = {},
) => ({
  createReport: overrides.createReport ?? vi.fn(),
  moderate: overrides.moderate ?? vi.fn(),
  getBan: overrides.getBan ?? vi.fn(),
  unbanUser: overrides.unbanUser ?? vi.fn(),
});

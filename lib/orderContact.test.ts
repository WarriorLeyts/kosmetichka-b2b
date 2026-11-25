import { describe, expect, it } from "vitest";
import { contactResumeStatus } from "./orderContact";
describe("contact pause history", () => {
  it("resumes the latest pause after multiple cycles, even with unordered rows", () => {
    expect(contactResumeStatus([
      { id: 7, fromStatus: "consultation", toStatus: "no_contact" },
      { id: 2, fromStatus: "assembly", toStatus: "no_contact" },
      { id: 8, fromStatus: "no_contact", toStatus: "consultation" },
    ])).toBe("consultation");
  });
});

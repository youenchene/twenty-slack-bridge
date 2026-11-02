import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseOpportunityEvent, verifySignature } from "../src/webhooks/twenty.js";

describe("parseOpportunityEvent", () => {
  it("parses a creation (new shape)", () => {
    expect(
      parseOpportunityEvent({ eventName: "opportunity.created", record: { id: "1", name: "Deal", stage: "NEW", amount: { amountMicros: 5_000_000_000, currencyCode: "EUR" } } }),
    ).toMatchObject({ kind: "created", id: "1", name: "Deal", stage: "New", amount: "5,000 EUR" });
  });
  it("parses a creation (legacy shape)", () => {
    expect(parseOpportunityEvent({ event: "opportunity.created", data: { id: "1", name: "Deal" } })).toMatchObject({ kind: "created" });
  });
  it("detects a stage change via updatedFields", () => {
    expect(parseOpportunityEvent({ eventName: "opportunity.updated", updatedFields: ["stage"], record: { id: "1", name: "D", stage: "MEETING" } })).toMatchObject({ kind: "stage_changed", stage: "Meeting" });
  });
  it("detects a stage change via before/after", () => {
    expect(parseOpportunityEvent({ eventName: "opportunity.updated", properties: { before: { stage: "NEW" } }, record: { id: "1", name: "D", stage: "MEETING" } })).toMatchObject({ kind: "stage_changed", previousStage: "New", stage: "Meeting" });
  });
  it("ignores non-stage updates, other objects and malformed payloads", () => {
    expect(parseOpportunityEvent({ eventName: "opportunity.updated", updatedFields: ["name"], record: { id: "1" } })).toBeUndefined();
    expect(parseOpportunityEvent({ eventName: "person.created", record: { id: "1" } })).toBeUndefined();
    expect(parseOpportunityEvent("nope")).toBeUndefined();
  });
});

describe("verifySignature", () => {
  const sign = (ts: string, body: string) => createHmac("sha256", "s3cret").update(`${ts}:${body}`).digest("hex");
  it("accepts a valid signature and rejects tampering or missing headers", () => {
    expect(verifySignature("s3cret", "1", sign("1", "{}"), "{}")).toBe(true);
    expect(verifySignature("s3cret", "1", sign("1", "{}"), "{ }")).toBe(false);
    expect(verifySignature("s3cret", undefined, sign("1", "{}"), "{}")).toBe(false);
    expect(verifySignature("s3cret", "1", "zz", "{}")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { extractUrls } from "./url";

describe("extractUrls", () => {
  it("returns [] for a message with no URL", () => {
    expect(extractUrls("hello world")).toEqual([]);
  });
  it("extracts a single http URL", () => {
    expect(extractUrls("check http://example.com please")).toEqual(["http://example.com"]);
  });
  it("extracts a single https URL", () => {
    expect(extractUrls("analyse https://example.com/foo?bar=1")).toEqual(["https://example.com/foo?bar=1"]);
  });
  it("extracts only the first URL when multiple are present", () => {
    expect(extractUrls("a https://a.com b https://b.com")).toEqual(["https://a.com"]);
  });
  it("ignores non-URL text containing dots", () => {
    expect(extractUrls("version 1.2.3 release")).toEqual([]);
  });
  it("strips trailing punctuation", () => {
    expect(extractUrls("see https://example.com.")).toEqual(["https://example.com"]);
  });
});

import { describe, expect, it, beforeEach } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("secret crypto", () => {
  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("hex");
  });

  it("round trips encrypted values without storing plaintext", () => {
    const encrypted = encryptSecret("sk-test-value");
    expect(encrypted).not.toContain("sk-test-value");
    expect(decryptSecret(encrypted)).toBe("sk-test-value");
  });
});

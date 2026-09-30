import { describe, expect, it } from "vitest";
import { assertPublicHost, isPrivateAddress } from "@/modules/knowledge/ingestion/network-guard";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
  ])("treats %s as non-public", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:2800:220:1:248:1893:25c8:1946", "::ffff:8.8.8.8"])(
    "treats %s as public",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe("assertPublicHost", () => {
  it("refuses IP literals in private ranges without resolving", async () => {
    await expect(assertPublicHost(new URL("http://127.0.0.1:3000/"), async () => ["8.8.8.8"])).rejects.toThrow();
    await expect(assertPublicHost(new URL("http://[::1]/"), async () => ["8.8.8.8"])).rejects.toThrow();
  });

  it("refuses when any resolved address is private", async () => {
    await expect(
      assertPublicHost(new URL("https://mixto.example.org/"), async () => ["8.8.8.8", "10.0.0.1"]),
    ).rejects.toThrow(/public address/);
  });

  it("refuses when nothing resolves", async () => {
    await expect(assertPublicHost(new URL("https://nada.example.org/"), async () => [])).rejects.toThrow();
  });

  it("accepts a host resolving only to public addresses", async () => {
    await expect(assertPublicHost(new URL("https://example.org/"), async () => ["93.184.216.34"])).resolves.toBeUndefined();
  });
});

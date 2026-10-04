import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Controller, Get, Module, Req } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { configureTrustedProxies, parseTrustedProxies } from "./trusted-proxies.js";

test("proxy: принимаются только явные IP/CIDR, без неограниченного доверия", () => {
  assert.deepEqual(parseTrustedProxies(), []);
  assert.deepEqual(parseTrustedProxies(" 127.0.0.1/32, ::1 "), ["127.0.0.1/32", "::1"]);
  for (const value of ["true", "false", "1", "loopback", "*", "0.0.0.0/0",
    "::/0", "127.0.0.1/33", "::1/129", "127.0.0.1/", "127.0.0.1,,::1",
    "proxy.example", "127.0.0.1:3000", "127.0.0.1/32/32"]) {
    assert.throws(() => parseTrustedProxies(value), /TRUSTED_PROXY_CIDRS/);
  }
});

@Controller()
class IpController {
  @Get()
  ip(@Req() req: { ip: string }) { return { ip: req.ip }; }
}
@Module({ controllers: [IpController] })
class ProxyTestModule {}

test("HTTP proxy: forged IP не обходит ближайший недоверенный адрес", async () => {
  const app = await NestFactory.create<NestExpressApplication>(ProxyTestModule, { logger: false });
  try {
    configureTrustedProxies(app, []);
    await app.listen(0, "127.0.0.1");
    const url = await app.getUrl();
    const request = async (forwarded: string) => {
      const response = await fetch(url, { headers: { "X-Forwarded-For": forwarded } });
      return await response.json() as { ip: string };
    };
    assert.equal((await request("203.0.113.5")).ip, "127.0.0.1");
    configureTrustedProxies(app, ["192.0.2.10/32"]);
    assert.equal((await request("203.0.113.5")).ip, "127.0.0.1");
    configureTrustedProxies(app, ["127.0.0.1/32"]);
    assert.equal((await request("203.0.113.5")).ip, "203.0.113.5");
    assert.equal((await request("198.51.100.99, 203.0.113.5")).ip, "203.0.113.5");
    assert.equal((await request("2001:db8::5")).ip, "2001:db8::5");
  } finally {
    await app.close();
  }
});

import { describe, expect, it } from "vitest";

import { parseDsn, parseFlags } from "./db";
import { parseCsvLine, parseLocalities } from "./localities";

describe("the DSN the make target hands over", () => {
  it("reads libpq keywords and requires TLS against the platform's own CA", () => {
    const cfg = parseDsn("host=db.example.test port=5433 dbname=effy user=effy_master password=p@ss=w0rd sslmode=require connect_timeout=10\n");
    expect(cfg).toMatchObject({ host: "db.example.test", port: 5433, database: "effy", user: "effy_master", password: "p@ss=w0rd", connectionTimeoutMillis: 10_000 });
    expect(cfg.ssl).toMatchObject({ rejectUnauthorized: true });
    expect((cfg.ssl as { ca: string }).ca).toContain("BEGIN CERTIFICATE");
  });

  it("reads a quoted password, and a URL", () => {
    expect(parseDsn(`host=h dbname=d user=u password='two words \\' and a quote'`).password).toBe("two words ' and a quote");
    expect(parseDsn("postgres://u:p@h:5432/d")).toEqual({ connectionString: "postgres://u:p@h:5432/d" });
  });

  it("turns TLS off only when told to, and refuses a DSN that names no database", () => {
    expect(parseDsn("host=localhost dbname=d user=u sslmode=disable").ssl).toBeUndefined();
    expect(() => parseDsn("host=localhost user=u")).toThrow(/host, dbname and user/);
  });
});

describe("arguments", () => {
  it("reads values and switches, and refuses what it does not know", () => {
    expect(parseFlags(["--email", "a@b.c", "--force"], { email: "string", force: "boolean" })).toEqual({ email: "a@b.c", force: true });
    expect(parseFlags(["--email=a@b.c"], { email: "string" })).toEqual({ email: "a@b.c" });
    expect(() => parseFlags(["--emial", "a@b.c"], { email: "string" })).toThrow(/unknown argument/);
    expect(() => parseFlags(["--email"], { email: "string" })).toThrow(/needs a value/);
  });
});

describe("the locality file", () => {
  it("parses a record with quotes and embedded commas", () => {
    expect(parseCsvLine(`3000, MELBOURNE ,VIC,"-37.8,1","say ""hi"""`)).toEqual(["3000", "MELBOURNE", "VIC", "-37.8,1", `say "hi"`]);
  });

  it("accepts the header in any order, upper-cases the state, and treats blank coordinates as absent", () => {
    expect(parseLocalities("state,name,postcode,lat,lng,count\nvic,RICHMOND,3121,,,12\r\n\n")).toEqual([
      { postcode: "3121", name: "RICHMOND", state: "VIC", latitude: "", longitude: "", addressCount: 12 },
    ]);
  });

  it("fails loudly on a header it cannot use or a count that is not a number", () => {
    expect(() => parseLocalities("postcode,state\n3000,VIC")).toThrow(/header must include/);
    expect(() => parseLocalities("postcode,locality,state,address_count\n3000,MELBOURNE,VIC,lots")).toThrow(/row 1: bad address_count/);
  });
});

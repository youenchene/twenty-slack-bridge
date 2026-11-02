import { describe, expect, it, vi } from "vitest";
import { createTwentyClient, TwentyApiError } from "../src/twenty-client.js";

const BASE = "https://crm.example.com";
const ID = "985a55b2-e498-4d9f-bd2d-8f70a855240d";

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const setup = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  const fetchMock = vi.fn(impl);
  const client = createTwentyClient({ baseUrl: `${BASE}/`, apiKey: "k", fetch: fetchMock as unknown as typeof fetch });
  return { fetchMock, client };
};

describe("search", () => {
  it("builds an AND-of-OR filter per token and sends the bearer token", async () => {
    const { fetchMock, client } = setup(() => reply({ data: { people: [] } }));
    await client.search("person", 'michel "camhi"');
    const [url, init] = fetchMock.mock.calls[0]!;
    const u = new URL(url);
    expect(u.pathname).toBe("/rest/people");
    expect(u.searchParams.get("depth")).toBe("1");
    expect(u.searchParams.get("filter")).toBe(
      'and(or(name.firstName[ilike]:"%michel%",name.lastName[ilike]:"%michel%",emails.primaryEmail[ilike]:"%michel%"),' +
        'or(name.firstName[ilike]:"%camhi%",name.lastName[ilike]:"%camhi%",emails.primaryEmail[ilike]:"%camhi%"))',
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("returns nothing and skips the network for an empty query", async () => {
    const { fetchMock, client } = setup(() => reply({}));
    expect(await client.search("company", '  "%"  ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps opportunities with company, stage and owner", async () => {
    const { client } = setup(() =>
      reply({
        data: {
          opportunities: [
            { id: ID, name: "EGIS - New", stage: "MEETING", company: { name: "EGIS" }, owner: { name: { firstName: "Youen", lastName: "Chéné" } } },
          ],
        },
      }),
    );
    expect(await client.search("opportunity", "egis")).toEqual([
      { kind: "opportunity", id: ID, name: "EGIS - New", company: "EGIS", stage: "MEETING", owner: "Youen Chéné", url: `${BASE}/object/opportunity/${ID}` },
    ]);
  });

  it("maps people with full name, job title and company", async () => {
    const { client } = setup(() =>
      reply({ data: { people: [{ id: ID, name: { firstName: "Michel Ange", lastName: "Camhi" }, jobTitle: "CDO", company: { name: "EGIS" } }] } }),
    );
    const [p] = await client.search("person", "camhi");
    expect(p).toMatchObject({ name: "Michel Ange Camhi", jobTitle: "CDO", company: "EGIS" });
  });

  it("throws TwentyApiError on non-2xx", async () => {
    const { client } = setup(() => reply({ error: "FORBIDDEN" }, 403));
    await expect(client.search("company", "x")).rejects.toMatchObject({ name: "TwentyApiError", status: 403 });
  });
});

describe("searchAll", () => {
  it("queries the three collections in parallel", async () => {
    const { fetchMock, client } = setup((url) => {
      const p = new URL(url).pathname;
      return reply({ data: { [p.split("/").pop()!]: [] } });
    });
    const r = await client.searchAll("x");
    expect(r).toEqual({ people: [], companies: [], opportunities: [] });
    expect(fetchMock.mock.calls.map(([u]) => new URL(u).pathname).sort()).toEqual(["/rest/companies", "/rest/opportunities", "/rest/people"]);
  });
});

describe("getRecord", () => {
  it("unwraps the singular key", async () => {
    const { fetchMock, client } = setup(() => reply({ data: { opportunity: { id: ID, name: "Deal", stage: "NEW" } } }));
    const r = await client.getRecord("opportunity", ID);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BASE}/rest/opportunities/${ID}?depth=1`);
    expect(r).toMatchObject({ name: "Deal", stage: "NEW" });
  });
});

describe("createNote", () => {
  it("creates the note then links it with the right target field", async () => {
    const { fetchMock, client } = setup((url) =>
      url.endsWith("/rest/notes") ? reply({ data: { createNote: { id: "note-1" } } }, 201) : reply({ data: { createNoteTarget: { id: "t" } } }, 201),
    );
    const id = await client.createNote({ title: "T", markdown: "body", target: { kind: "company", id: ID } });
    expect(id).toBe("note-1");
    const [first, second] = fetchMock.mock.calls;
    expect(JSON.parse(first![1]!.body as string)).toEqual({ title: "T", bodyV2: { markdown: "body" } });
    expect(second![0]).toBe(`${BASE}/rest/noteTargets`);
    expect(JSON.parse(second![1]!.body as string)).toEqual({ noteId: "note-1", targetCompanyId: ID });
  });

  it("fails if no note id comes back and does not create a target", async () => {
    const { fetchMock, client } = setup(() => reply({ data: {} }, 201));
    await expect(client.createNote({ title: "T", markdown: "b", target: { kind: "person", id: ID } })).rejects.toBeInstanceOf(TwentyApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("parseRecordUrl", () => {
  const { client } = setup(() => reply({}));
  it("parses own-instance record URLs", () => {
    expect(client.parseRecordUrl(`${BASE}/object/person/${ID}?x=1`)).toEqual({ kind: "person", id: ID });
  });
  it("rejects foreign hosts and non-record paths", () => {
    expect(client.parseRecordUrl(`https://evil.com/object/person/${ID}`)).toBeUndefined();
    expect(client.parseRecordUrl(`${BASE}/settings`)).toBeUndefined();
  });
});

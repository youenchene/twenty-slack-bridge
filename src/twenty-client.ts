export type RecordKind = "person" | "company" | "opportunity";

export interface CrmRecord {
  readonly kind: RecordKind;
  readonly id: string;
  readonly name: string;
  readonly company?: string;
  readonly stage?: string;
  readonly owner?: string;
  readonly jobTitle?: string;
  readonly url: string;
}

export interface WorkspaceMember {
  readonly id: string;
  readonly name: string;
}

export interface CrmTask {
  readonly id: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status?: string;
  readonly url: string;
}

export interface TwentyClientOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
}

export class TwentyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TwentyApiError";
  }
}

const COLLECTION: Record<RecordKind, string> = {
  person: "people",
  company: "companies",
  opportunity: "opportunities",
};

const TARGET_FIELD: Record<RecordKind, string> = {
  person: "targetPersonId",
  company: "targetCompanyId",
  opportunity: "targetOpportunityId",
};

type Json = Record<string, unknown>;

const asObj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const asStr = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

const fullName = (n: unknown): string | undefined => {
  const o = asObj(n);
  return [asStr(o.firstName), asStr(o.lastName)].filter(Boolean).join(" ") || undefined;
};

export const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  SCREENING: "Screening",
  MEETING: "Meeting",
  PROPOSAL: "Proposal",
  CUSTOMER: "Customer",
};
export const stageLabel = (stage?: string): string | undefined =>
  stage ? (STAGE_LABELS[stage] ?? stage) : undefined;

const tokens = (query: string): string[] =>
  query.replace(/["\\%(),]/g, " ").split(/\s+/).filter(Boolean).slice(0, 5);

const ilike = (field: string, token: string): string => `${field}[ilike]:"%${token}%"`;

const allTokens = (fields: string[], query: string): string | undefined => {
  const parts = tokens(query).map((t) => `or(${fields.map((f) => ilike(f, t)).join(",")})`);
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : `and(${parts.join(",")})`;
};

const SEARCH_FIELDS: Record<RecordKind, string[]> = {
  person: ["name.firstName", "name.lastName", "emails.primaryEmail"],
  company: ["name"],
  opportunity: ["name"],
};

export function createTwentyClient(opts: TwentyClientOptions) {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl.replace(/\/+$/, "");

  const request = async (path: string, init: RequestInit = {}): Promise<Json> => {
    const res = await doFetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const text = await res.text();
    if (!res.ok) throw new TwentyApiError(res.status, `Twenty ${res.status} on ${path}: ${text.slice(0, 300)}`);
    return text ? (JSON.parse(text) as Json) : {};
  };

  const recordUrl = (kind: RecordKind | "task", id: string): string => `${base}/object/${kind}/${id}`;

  const list = async (collection: string, params: Record<string, string>): Promise<Json[]> => {
    const body = await request(`/rest/${collection}?${new URLSearchParams(params)}`);
    const rows = asObj(body.data)[collection];
    return Array.isArray(rows) ? rows.map(asObj) : [];
  };

  const quoted = (v: string): string => `"${v.replace(/["\\]/g, "")}"`;

  const toRecord = (kind: RecordKind, raw: Json): CrmRecord => {
    const id = String(raw.id);
    const company = asStr(asObj(raw.company).name);
    const owner = fullName(asObj(raw.owner).name);
    if (kind === "person") {
      return { kind, id, name: fullName(raw.name) ?? "(unnamed)", company, jobTitle: asStr(raw.jobTitle), url: recordUrl(kind, id) };
    }
    if (kind === "company") {
      return { kind, id, name: asStr(raw.name) ?? "(unnamed)", owner: fullName(asObj(raw.accountOwner).name), url: recordUrl(kind, id) };
    }
    return { kind, id, name: asStr(raw.name) ?? "(unnamed)", company, stage: asStr(raw.stage), owner, url: recordUrl(kind, id) };
  };

  const search = async (kind: RecordKind, query: string, limit = 5): Promise<CrmRecord[]> => {
    const filter = allTokens(SEARCH_FIELDS[kind], query);
    if (!filter) return [];
    const qs = new URLSearchParams({ filter, limit: String(limit), depth: "1" });
    const body = await request(`/rest/${COLLECTION[kind]}?${qs}`);
    const rows = asObj(body.data)[COLLECTION[kind]];
    return Array.isArray(rows) ? rows.map((r) => toRecord(kind, asObj(r))) : [];
  };

  return {
    recordUrl,
    searchAll: async (query: string, limit = 5) => {
      const [people, companies, opportunities] = await Promise.all([
        search("person", query, limit),
        search("company", query, limit),
        search("opportunity", query, limit),
      ]);
      return { people, companies, opportunities };
    },
    search,
    getRecord: async (kind: RecordKind, id: string): Promise<CrmRecord> => {
      const body = await request(`/rest/${COLLECTION[kind]}/${encodeURIComponent(id)}?depth=1`);
      return toRecord(kind, asObj(asObj(body.data)[kind]));
    },
    /** Maps a login email to a Twenty workspace member (case-insensitive). */
    findMemberByEmail: async (email: string): Promise<WorkspaceMember | undefined> => {
      const [row] = await list("workspaceMembers", { filter: `userEmail[ilike]:${quoted(email.trim())}`, limit: "1" });
      return row ? { id: String(row.id), name: fullName(row.name) ?? email } : undefined;
    },
    /** Opportunities owned by the member whose stage is not CUSTOMER, soonest close date first. */
    listOpenOpportunities: async (memberId: string, limit = 10): Promise<CrmRecord[]> => {
      const rows = await list("opportunities", {
        filter: `and(ownerId[eq]:${quoted(memberId)},or(stage[is]:NULL,stage[neq]:"CUSTOMER"))`,
        orderBy: "closeDate[AscNullsLast]",
        limit: String(limit),
        depth: "1",
      });
      return rows.map((r) => toRecord("opportunity", r));
    },
    /** Unfinished tasks assigned to the member, due on or before `dueBefore` (ISO), oldest first. */
    listDueTasks: async (memberId: string, dueBefore: string, limit = 10): Promise<CrmTask[]> => {
      const rows = await list("tasks", {
        filter: `and(assigneeId[eq]:${quoted(memberId)},or(status[is]:NULL,status[neq]:"DONE"),dueAt[lte]:${quoted(dueBefore)})`,
        orderBy: "dueAt[AscNullsLast]",
        limit: String(limit),
      });
      return rows.map((r) => {
        const id = String(r.id);
        return { id, title: asStr(r.title) ?? "(untitled)", dueAt: asStr(r.dueAt), status: asStr(r.status), url: recordUrl("task", id) };
      });
    },
    /** Creates a note, then links it to the target record. Returns the note id. */
    createNote: async (input: { title: string; markdown: string; target: { kind: RecordKind; id: string } }): Promise<string> => {
      const created = await request("/rest/notes", {
        method: "POST",
        body: JSON.stringify({ title: input.title, bodyV2: { markdown: input.markdown } }),
      });
      const noteId = asStr(asObj(asObj(created.data).createNote).id);
      if (!noteId) throw new TwentyApiError(502, "Twenty did not return a note id");
      await request("/rest/noteTargets", {
        method: "POST",
        body: JSON.stringify({ noteId, [TARGET_FIELD[input.target.kind]]: input.target.id }),
      });
      return noteId;
    },
    /** Parses a Twenty record URL (/object/<kind>/<id>) belonging to this instance. */
    parseRecordUrl: (url: string): { kind: RecordKind; id: string } | undefined => {
      if (!url.startsWith(`${base}/`)) return undefined;
      const m = /^\/object\/(person|company|opportunity)\/([0-9a-f-]{36})/i.exec(new URL(url).pathname);
      return m ? { kind: m[1] as RecordKind, id: m[2] as string } : undefined;
    },
  };
}

export type TwentyClient = ReturnType<typeof createTwentyClient>;

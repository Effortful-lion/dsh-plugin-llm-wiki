// host/index.ts
import z from "@deepseek-ai/schemastery";
import { existsSync as existsSync3, watch } from "node:fs";
import { basename as basename5, join as join8 } from "node:path";

// core/model.ts
var WIKI_LAYOUT = {
  schemaFile: "WIKI.md",
  inboxDir: "0-inbox",
  inboxNotes: "0-inbox/notes",
  inboxFiles: "0-inbox/files",
  inboxParts: "0-inbox/files/.parts",
  inboxCollect: "0-inbox/collect",
  rawDir: "1-raw",
  attachments: "1-raw/attachments",
  wikiDir: "2-wiki",
  indexPath: "2-wiki/index.md",
  logPath: "2-wiki/log.md",
  proposalDir: "3-review",
  backupDir: "3-review/.backup",
  trashDir: "3-review/.trash",
  jobsFile: "2-wiki/jobs.json"
};
var WRITABLE_PREFIXES = [
  "0-inbox/",
  "1-raw/",
  "2-wiki/",
  "3-review/"
];
var PAGE_TYPE_SEGMENT = {
  entity: "entities",
  concept: "concepts",
  source: "sources",
  answer: "answers",
  project: "projects",
  index: "",
  log: ""
};
var SEGMENT_TYPE = {
  entities: "entity",
  concepts: "concept",
  sources: "source",
  answers: "answer",
  projects: "project"
};
var CONTENT_TYPES = ["entity", "concept", "source", "answer", "project"];
var STATUSES = ["stub", "active", "contested", "deprecated"];
var CANONICAL_FIELDS = [
  "id",
  "type",
  "title",
  "summary",
  "status",
  "aliases",
  "tags",
  "sources",
  "domain",
  "created",
  "updated",
  "confidence"
];
var RAW_FIELDS = [
  "id",
  "type",
  "title",
  "summary",
  "status",
  "domain",
  "origin",
  "confirmed",
  "sources",
  "created",
  "updated",
  "derivedFrom"
];
var RULES = {
  "L001-orphan": { severity: "warn", title: "\u5B64\u513F\u9875\uFF1A\u6CA1\u6709\u4EFB\u4F55\u5165\u94FE", fixable: false },
  "L002-broken-link": { severity: "error", title: "\u65AD\u94FE\uFF1Awikilink \u6307\u5411\u4E0D\u5B58\u5728\u7684\u9875", fixable: false },
  "L003-schema": { severity: "error", title: "frontmatter \u4E0D\u7B26\u5408 schema", fixable: false },
  "L004-unindexed": { severity: "warn", title: "\u9875\u9762\u672A\u767B\u8BB0\u5728 index.md", fixable: true },
  "L005-dangling-index": { severity: "error", title: "index.md \u6761\u76EE\u6307\u5411\u4E0D\u5B58\u5728\u7684\u9875", fixable: true },
  "L006-summary-long": { severity: "warn", title: "summary \u8D85\u8FC7 120 \u5B57", fixable: false },
  "L007-alias-collision": { severity: "error", title: "\u522B\u540D\u6216\u6807\u9898\u5728\u591A\u4E2A\u9875\u9762\u91CD\u590D", fixable: false },
  "L008-uncited": { severity: "warn", title: "\u975E stub \u9875\u6CA1\u6709 sources \u51FA\u5904", fixable: false },
  "L009-duplicate-id": { severity: "error", title: "\u9875\u9762 id \u91CD\u590D", fixable: false },
  "L010-no-links": { severity: "warn", title: "\u9875\u9762\u6CA1\u6709 `## \u5173\u8054` \u51FA\u94FE", fixable: false },
  "L011-stale": { severity: "info", title: "\u957F\u671F\u672A\u66F4\u65B0\u7684\u6D3B\u8DC3\u9875", fixable: false },
  "L012-proposal-pending": { severity: "info", title: "\u5B58\u5728\u672A\u5904\u7406\u7684\u5199\u5165\u63D0\u6848", fixable: false }
};
var LIMITS = {
  summaryChars: 120,
  relatedSection: "## \u5173\u8054",
  staleDays: 180,
  /** 单次 wiki_read 最多返回的页面数。 */
  readBatch: 6,
  /** 单页全文读取的字符预算。 */
  fullPageChars: 12e3,
  /** head 模式返回的正文预览长度。 */
  headChars: 1200,
  /** 检索结果每条的摘要长度。 */
  snippetChars: 110,
  /** 提案（proposal）保留的正文上限。 */
  proposalChars: 2e4,
  /** 单个上传文件的上限（字节）。 */
  uploadBytes: 64 * 1024 * 1024,
  /** 提案保留天数，超过由 J04 清掉。 */
  proposalKeepDays: 7,
  /** 回收站保留天数，超过后真删。 */
  trashKeepDays: 7,
  /** 去重候选的默认相似度阈值。 */
  dupThreshold: 0.75,
  /** 一次去重扫描最多产生的候选对。 */
  dupMaxPairs: 20,
  /** 音视频切片阈值（分钟）与单片长度（分钟）。 */
  audioMaxMinutes: 30,
  audioChunkMinutes: 10
};

// host/actions.ts
import { join as join3, basename as basename2 } from "node:path";

// core/frontmatter.ts
var KEY_LINE = /^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/;
function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}
function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^[-+]?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^[-+]?\d*\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === "") return [];
    return splitInlineList(inner).map((item) => parseScalar(item));
  }
  if (trimmed.startsWith("{")) {
    return trimmed;
  }
  return unquote(trimmed);
}
function splitInlineList(inner) {
  const items = [];
  let current = "";
  let quote = null;
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ",") {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") items.push(current.trim());
  return items;
}
function parseDocument(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const result = { data: {}, body: normalized, hasFrontmatter: false, unknownLines: [] };
  if (lines[0]?.trim() !== "---") return result;
  let close = -1;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === "---" || line === "...") {
      close = index;
      break;
    }
  }
  if (close === -1) return result;
  result.hasFrontmatter = true;
  result.body = lines.slice(close + 1).join("\n").replace(/^\n+/, "");
  let pendingKey = null;
  let pendingBlock = null;
  let blockLines = [];
  const flush = () => {
    if (!pendingKey) return;
    if (pendingBlock === "list") {
      result.data[pendingKey] = blockLines.map((item) => unquote(item.replace(/^-\s*/, "")));
    } else if (pendingBlock === "literal" || pendingBlock === "folded") {
      const joined = pendingBlock === "literal" ? blockLines.join("\n") : blockLines.join(" ");
      result.data[pendingKey] = joined;
    }
    pendingKey = null;
    pendingBlock = null;
    blockLines = [];
  };
  for (let index = 1; index < close; index += 1) {
    const rawLine = lines[index];
    const lineNumber = index + 1;
    if (rawLine.trim() === "" || rawLine.trimStart().startsWith("#")) {
      if (pendingBlock === "literal" || pendingBlock === "folded") {
        flush();
      }
      continue;
    }
    const itemMatch = /^\s*-\s*(.*)$/.exec(rawLine);
    if (itemMatch) {
      if (pendingKey && (pendingBlock === "list" || pendingBlock === null)) {
        pendingBlock = "list";
        blockLines.push(itemMatch[1] ?? "");
        continue;
      }
      result.unknownLines.push({ line: lineNumber, text: rawLine });
      continue;
    }
    if ((pendingBlock === "literal" || pendingBlock === "folded") && /^\s+/.test(rawLine)) {
      blockLines.push(rawLine.trim());
      continue;
    }
    const keyMatch = KEY_LINE.exec(rawLine);
    if (!keyMatch) {
      result.unknownLines.push({ line: lineNumber, text: rawLine });
      continue;
    }
    flush();
    const key = keyMatch[1];
    const value = (keyMatch[2] ?? "").trim();
    if (value === "") {
      pendingKey = key;
      pendingBlock = null;
      continue;
    }
    if (value === "|" || value === "|-" || value === ">") {
      pendingKey = key;
      pendingBlock = value.startsWith("|") ? "literal" : "folded";
      continue;
    }
    result.data[key] = parseScalar(value);
  }
  flush();
  return result;
}
var NEEDS_QUOTE = /[:#\[\]{}&*!|>'"%@`]|^\s|\s$/;
function formatScalar(value) {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (value === null) return "null";
  const text = String(value);
  if (text === "" || NEEDS_QUOTE.test(text) || text.includes("\n")) return JSON.stringify(text);
  return text;
}
function stringifyFrontmatter(data, order) {
  const keys = order ? [...order.filter((key) => data[key] !== void 0 && data[key] !== null)] : [];
  for (const key of Object.keys(data)) {
    if (data[key] === void 0 || data[key] === null) continue;
    if (!keys.includes(key)) keys.push(key);
  }
  const lines = ["---"];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${formatScalar(item)}`);
      continue;
    }
    if (typeof value === "object") {
      lines.push(`${key}:`);
      for (const [childKey, childValue] of Object.entries(value)) {
        lines.push(`  ${childKey}: ${formatScalar(childValue)}`);
      }
      continue;
    }
    lines.push(`${key}: ${formatScalar(value)}`);
  }
  lines.push("---");
  return `${lines.join("\n")}
`;
}

// core/parse.ts
function stripCode(text) {
  return text.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/%%[\s\S]*?%%/g, "");
}
function findSection(text, heading) {
  const lines = text.split("\n");
  const normalizedHeading = heading.replace(/^#+\s*/, "").trim();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("## ")) continue;
    if (line.slice(3).trim() !== normalizedHeading) continue;
    let endLine = lines.length + 1;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^##\s/.test(lines[cursor])) {
        endLine = cursor + 1;
        break;
      }
    }
    return { headingLine: index + 1, startLine: index + 2, endLine };
  }
  return void 0;
}
function extractLinks(text) {
  const clean = stripCode(text);
  const lines = clean.split("\n");
  const related = findSection(clean, LIMITS.relatedSection);
  const links = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pattern = /(!?)\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      if (match[1] === "!") continue;
      const raw = match[2].split("|")[0].split("#")[0].trim().replace(/\.md$/, "");
      if (raw === "") continue;
      const lineNumber = index + 1;
      links.push({
        raw,
        inRelated: related !== void 0 && lineNumber >= related.startLine && lineNumber < related.endLine,
        line: lineNumber
      });
    }
  }
  return links;
}
function pageIdFromPath(root, path) {
  const prefix = `${root}/`;
  const relative3 = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  if (relative3.startsWith(`${WIKI_LAYOUT.rawDir}/`)) {
    return `raw/${relative3.slice(WIKI_LAYOUT.rawDir.length + 1).replace(/\.md$/, "")}`;
  }
  const withinWiki = relative3.startsWith(`${WIKI_LAYOUT.wikiDir}/`) ? relative3.slice(WIKI_LAYOUT.wikiDir.length + 1) : relative3;
  const withoutExtension = withinWiki.replace(/\.md$/, "");
  if (withoutExtension === "index" || withoutExtension === "log") return withoutExtension;
  return withoutExtension;
}
function typeOfId(id) {
  if (id === "index") return "index";
  if (id === "log") return "log";
  const segment = id.split("/")[0] ?? "";
  return SEGMENT_TYPE[segment] ?? null;
}
function asString(value, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}
function asStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter((item) => item !== "");
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  return [];
}
function parsePage(path, text, root) {
  const parsed = parseDocument(text);
  const fm = parsed.data;
  const derivedId = pageIdFromPath(root, path);
  const layer = derivedId.startsWith("raw/") ? "raw" : "wiki";
  const issues = [];
  if (!parsed.hasFrontmatter) issues.push("\u7F3A\u5C11 frontmatter");
  for (const unknown of parsed.unknownLines) {
    issues.push(`\u65E0\u6CD5\u89E3\u6790\u7684 frontmatter \u884C ${unknown.line}\uFF1A${unknown.text.slice(0, 40)}`);
  }
  const declaredId = asString(fm.id);
  const id = declaredId || derivedId;
  if (declaredId && declaredId !== derivedId) issues.push(`id \u4E0E\u8DEF\u5F84\u4E0D\u4E00\u81F4\uFF1A\u58F0\u660E ${declaredId}\uFF0C\u8DEF\u5F84 ${derivedId}`);
  if (!declaredId && fmtRequiresId(derivedId)) issues.push("frontmatter \u7F3A\u5C11 id");
  const declaredType = asString(fm.type);
  const type = layer === "raw" ? CONTENT_TYPES.includes(declaredType) ? declaredType : "source" : typeOfId(derivedId);
  if (layer === "wiki") {
    if (!declaredType) issues.push("frontmatter \u7F3A\u5C11 type");
    else if (!CONTENT_TYPES.includes(declaredType) && !["index", "log"].includes(declaredType)) {
      issues.push(`\u672A\u77E5 type\uFF1A${declaredType}`);
    } else if (type && declaredType !== type) {
      issues.push(`type \u4E0E\u76EE\u5F55\u4E0D\u4E00\u81F4\uFF1A\u58F0\u660E ${declaredType}\uFF0C\u76EE\u5F55 ${type}`);
    }
  }
  const title = asString(fm.title);
  if (title === "") issues.push("\u7F3A\u5C11 title");
  const rawStatus = asString(fm.status, "stub");
  const status = STATUSES.includes(rawStatus) ? rawStatus : "stub";
  if (rawStatus !== status) issues.push(`\u975E\u6CD5 status\uFF1A${rawStatus}`);
  const summary = asString(fm.summary);
  if (type !== "index" && type !== "log" && summary === "") issues.push("\u7F3A\u5C11 summary");
  const confidenceRaw = fm.confidence;
  const confidence = typeof confidenceRaw === "number" ? confidenceRaw : void 0;
  if (confidenceRaw !== void 0 && (confidence === void 0 || confidence < 0 || confidence > 1)) {
    issues.push("confidence \u5FC5\u987B\u5728 0..1");
  }
  return {
    path,
    id,
    type: type ?? "concept",
    title: title || id,
    summary,
    status,
    aliases: asStringArray(fm.aliases),
    tags: asStringArray(fm.tags),
    sources: asStringArray(fm.sources),
    domain: asString(fm.domain) || void 0,
    created: asString(fm.created),
    updated: asString(fm.updated) || asString(fm.created),
    confidence,
    layer,
    body: parsed.body,
    frontmatter: fm,
    schemaIssues: issues
  };
}
function fmtRequiresId(id) {
  return id !== WIKI_LAYOUT.indexPath && id !== "index" && id !== "log";
}
function normalizeName(name2) {
  return name2.trim().toLowerCase();
}
function buildSnapshot(pages, rawPages = []) {
  const byId = /* @__PURE__ */ new Map();
  const raw = /* @__PURE__ */ new Map();
  const problems = [];
  const nameIndex = /* @__PURE__ */ new Map();
  for (const page of rawPages) raw.set(page.id, page);
  for (const page of pages) {
    if (byId.has(page.id)) {
      problems.push({
        code: "L009-duplicate-id",
        severity: "warn",
        page: page.id,
        message: `id \u91CD\u590D\uFF1A${byId.get(page.id).path} \u4E0E ${page.path}`
      });
      continue;
    }
    byId.set(page.id, page);
  }
  const register = (name2, id) => {
    const key = normalizeName(name2);
    if (key === "") return;
    const existing = nameIndex.get(key);
    if (existing && existing !== id) {
      problems.push({
        code: "L007-alias-collision",
        severity: "error",
        page: existing,
        target: id,
        message: `\u540D\u79F0\u300C${name2}\u300D\u540C\u65F6\u6307\u5411 ${existing} \u4E0E ${id}`
      });
      return;
    }
    nameIndex.set(key, id);
  };
  for (const page of byId.values()) {
    if (page.type === "index" || page.type === "log") continue;
    register(page.id, page.id);
    register(page.id.split("/").slice(1).join("/"), page.id);
    register(page.title, page.id);
    for (const alias of page.aliases) register(alias, page.id);
  }
  const linksById = /* @__PURE__ */ new Map();
  const inbound = /* @__PURE__ */ new Map();
  const resolve2 = (raw2) => {
    const direct = byId.has(raw2) ? raw2 : void 0;
    if (direct) return direct;
    const normalized = normalizeName(raw2.replace(/^\/+/, ""));
    const viaName = nameIndex.get(normalized);
    if (viaName) return viaName;
    const lower = raw2.toLowerCase();
    for (const id of byId.keys()) {
      if (id.toLowerCase() === lower) return id;
    }
    return void 0;
  };
  for (const page of byId.values()) {
    const links = extractLinks(page.body);
    for (const link of links) link.resolved = resolve2(link.raw);
    linksById.set(page.id, links);
    if (page.type === "index" || page.type === "log") continue;
    for (const link of links) {
      if (!link.resolved || link.resolved === page.id) continue;
      inbound.set(link.resolved, (inbound.get(link.resolved) ?? 0) + 1);
    }
  }
  return { pages: [...byId.values()], byId, raw, linksById, inbound, nameIndex, problems };
}
function relatedOf(snapshot, id) {
  const links = snapshot.linksById.get(id) ?? [];
  return links.filter((link) => link.inRelated && link.resolved && link.resolved !== id).map((link) => link.resolved);
}
function backlinksOf(snapshot, id) {
  const result = [];
  for (const [sourceId, links] of snapshot.linksById) {
    if (sourceId === "index") continue;
    if (links.some((link) => link.resolved === id && link.inRelated)) result.push(sourceId);
  }
  return result;
}

// core/draft.ts
function slugify(text) {
  const slug = text.trim().toLowerCase().replace(/['’"]/g, "").replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug === "" ? "untitled" : slug;
}
function pagePath(root, type, slug) {
  const segment = PAGE_TYPE_SEGMENT[type];
  return `${root}/${WIKI_LAYOUT.wikiDir}/${segment}/${slug}.md`;
}
function draftId(draft) {
  if (draft.id && draft.id.trim() !== "") {
    return draft.id.trim().replace(/\.md$/, "").replace(/^\/+/, "");
  }
  return `${PAGE_TYPE_SEGMENT[draft.type]}/${slugify(draft.title)}`;
}
function validateDraft(draft, snapshot, root, options = {}) {
  const errors = [];
  const warnings = [];
  const id = draftId(draft);
  const segment = PAGE_TYPE_SEGMENT[draft.type];
  if (!CONTENT_TYPES.includes(draft.type)) errors.push(`type \u53EA\u80FD\u662F ${CONTENT_TYPES.join(" / ")}`);
  const idParts = id.split("/");
  if (idParts.length !== 2 || idParts[0] !== segment) {
    errors.push(`id \u5FC5\u987B\u5F62\u5982 ${segment}/<slug>\uFF0C\u5F53\u524D\u662F ${id}`);
  }
  if (!/^[a-z0-9\p{Letter}\p{Number}-]+$/u.test(idParts[1] ?? "")) {
    errors.push(`slug \u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E2D\u6587\u4E0E\u8FDE\u5B57\u7B26\uFF1A${idParts[1] ?? ""}`);
  }
  const path = pagePath(root, draft.type, idParts[1] ?? slugify(draft.title));
  if (snapshot.byId.has(id) && !options.allowExisting) {
    errors.push(`id \u5DF2\u5B58\u5728\uFF1A${id}\uFF08\u66F4\u65B0\u8BF7\u663E\u5F0F\u4F20 action=update\uFF09`);
  }
  if (!snapshot.byId.has(id) && options.allowExisting) {
    errors.push(`\u8981\u66F4\u65B0\u7684\u9875\u4E0D\u5B58\u5728\uFF1A${id}\uFF08\u65B0\u5EFA\u8BF7\u7528 action=create\uFF09`);
  }
  const title = draft.title.trim();
  if (title === "") errors.push("title \u4E0D\u80FD\u4E3A\u7A7A");
  if (title.length > 80) warnings.push(`title ${title.length} \u5B57\uFF0C\u5EFA\u8BAE \u226480`);
  const summary = draft.summary.trim();
  if (summary === "") errors.push("summary \u4E0D\u80FD\u4E3A\u7A7A\uFF1A\u5B83\u662F\u7D22\u5F15\u4E0E\u68C0\u7D22\u7684\u552F\u4E00\u5165\u53E3");
  if (summary.length > LIMITS.summaryChars) errors.push(`summary ${summary.length} \u5B57\uFF0C\u4E0A\u9650 ${LIMITS.summaryChars}`);
  const status = draft.status ?? options.existing?.status ?? "active";
  if (!STATUSES.includes(status)) errors.push(`status \u53EA\u80FD\u662F ${STATUSES.join(" / ")}`);
  const body = draft.body.trim();
  if (body === "") errors.push("body \u4E0D\u80FD\u4E3A\u7A7A");
  const related = body.includes(LIMITS.relatedSection);
  if (!related) errors.push(`body \u5FC5\u987B\u5305\u542B \`${LIMITS.relatedSection}\` \u6BB5\u5E76\u81F3\u5C11\u94FE\u63A5\u4E00\u9875`);
  const links = extractLinks(body);
  const relatedLinks = links.filter((link) => link.inRelated);
  if (related && relatedLinks.length === 0) errors.push(`\`${LIMITS.relatedSection}\` \u91CC\u81F3\u5C11\u8981\u6709\u4E00\u6761 [[wikilink]]`);
  for (const link of links) {
    const resolved = snapshot.byId.has(link.raw) ? link.raw : void 0;
    if (!resolved && !relatedLinksToExisting(snapshot, link.raw)) {
      errors.push(`\u7B2C ${link.line} \u884C\u6307\u5411\u4E0D\u5B58\u5728\u7684\u9875\uFF1A[[${link.raw}]]\uFF08\u5148\u5EFA\u9875\uFF0C\u6216\u6539\u6210\u5DF2\u5B58\u5728\u7684 id\uFF09`);
    }
  }
  const effectiveSources = (draft.sources ?? options.existing?.sources ?? []).map((source) => source.trim()).filter((source) => source !== "");
  if (effectiveSources.length === 0 && (status === "active" || status === "contested") && draft.type !== "answer") {
    errors.push("active / contested \u9875\u5FC5\u987B\u6709 sources\uFF1A\u65E0\u51FA\u5904\u7684\u65AD\u8A00\u4E0D\u8BB8\u8FDB\u5E93");
  }
  for (const source of effectiveSources) {
    if (!snapshot.byId.has(source)) warnings.push(`sources \u91CC\u7684 ${source} \u8FD8\u4E0D\u662F\u5DF2\u5EFA\u9875\u9762\uFF08\u5EFA\u8BAE\u5EFA\u4E00\u5F20 sources \u9875\uFF09`);
  }
  const effectiveAliases = draft.aliases ?? options.existing?.aliases ?? [];
  for (const alias of effectiveAliases) {
    if (alias.trim() === "") continue;
    const collision = snapshot.nameIndex.get(alias.trim().toLowerCase());
    if (collision && collision !== id) errors.push(`\u522B\u540D\u300C${alias}\u300D\u5DF2\u5C5E\u4E8E ${collision}`);
  }
  if (draft.confidence !== void 0 && (draft.confidence < 0 || draft.confidence > 1)) {
    errors.push("confidence \u5FC5\u987B\u5728 0..1");
  }
  if (draft.type === "source" && effectiveSources.length > 0 && !effectiveSources.some((source) => source === id)) {
    warnings.push("\u6765\u6E90\u9875\u901A\u5E38\u5F15\u7528\u81EA\u5DF1\uFF1B\u786E\u8BA4 sources \u5B57\u6BB5\u6CA1\u6709\u6307\u9519");
  }
  return { errors, warnings, id, path };
}
function relatedLinksToExisting(snapshot, raw) {
  const normalized = raw.trim().toLowerCase();
  if (snapshot.byId.has(raw)) return true;
  for (const [name2, id] of snapshot.nameIndex) {
    if (name2 === normalized) return true;
    if (id.toLowerCase() === normalized) return true;
  }
  return false;
}
function buildPageText(draft, options) {
  const id = draftId(draft);
  const status = draft.status ?? options.existing?.status ?? "active";
  const date = options.now.slice(0, 10);
  const before = options.existing;
  const pickList = (fromDraft, fromExisting) => {
    if (fromDraft !== void 0) return fromDraft.map((item) => item.trim()).filter((item) => item !== "");
    return (fromExisting ?? []).map((item) => item.trim()).filter((item) => item !== "");
  };
  const tags = pickList(draft.tags, before?.tags).map((tag) => tag.replace(/^#/, ""));
  const aliases = pickList(draft.aliases, before?.aliases);
  const sources = pickList(draft.sources, before?.sources);
  const domain = draft.domain !== void 0 && draft.domain !== "" ? draft.domain.trim() : before?.domain ?? "";
  const confidence = draft.confidence === void 0 ? before?.confidence : draft.confidence;
  const frontmatter = stringifyFrontmatter({
    id,
    type: draft.type,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    status,
    aliases,
    tags,
    sources,
    ...domain === "" ? {} : { domain },
    created: before?.created || date,
    updated: date,
    ...confidence === void 0 ? {} : { confidence }
  }, CANONICAL_FIELDS);
  const body = draft.body.trim();
  const withTitle = body.startsWith("# ") ? body : `# ${draft.title.trim()}

${body}`;
  return `${frontmatter}
${withTitle}
`;
}
function proposalPath(root, id, now, suffix) {
  const stamp = now.replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-").slice(0, 13);
  const tail = slugify(id.split("/").slice(1).join("-") || id);
  const extra = suffix === void 0 || suffix === "" ? "" : `-${slugify(suffix)}`;
  return `${root}/${WIKI_LAYOUT.proposalDir}/${stamp}-${tail}${extra}.md`;
}
function buildProposalText(input) {
  const meta = stringifyFrontmatter({
    id: `proposal/${input.target}`,
    type: "proposal",
    title: `\u63D0\u6848\uFF1A${input.target}`,
    status: "pending",
    created: input.now.slice(0, 10),
    updated: input.now.slice(0, 10),
    // 刻意用扁平键：本库的 YAML 子集不支持嵌套映射，而提案必须能被零依赖解析。
    proposal_target: input.target,
    proposal_action: input.action,
    proposal_base: input.baseUpdated ?? "none",
    proposal_reason: (input.rationale ?? "").trim(),
    proposal_generated_at: input.now
  }, [...CANONICAL_FIELDS, "proposal_target", "proposal_action", "proposal_base", "proposal_reason", "proposal_generated_at"]);
  const rationale = (input.rationale ?? "").trim();
  const body = input.pageText.length > LIMITS.proposalChars ? `${input.pageText.slice(0, LIMITS.proposalChars)}

\u2026\uFF08\u63D0\u6848\u6B63\u6587\u8D85\u8FC7 ${LIMITS.proposalChars} \u5B57\u7B26\u88AB\u622A\u65AD\uFF0C\u8BF7\u5206\u9875\u63D0\u4EA4\uFF09
` : input.pageText;
  return [
    meta,
    `<!-- ${rationale === "" ? "llm-wiki \u63D0\u6848" : `\u7406\u7531\uFF1A${rationale}`} -->`,
    "",
    "## \u62DF\u5199\u5165\u5185\u5BB9",
    "",
    PAGE_START,
    body.trimEnd(),
    PAGE_END,
    "",
    "## \u5408\u5E76\u65B9\u5F0F",
    "",
    `1. \u5BA1\u9605\u4E0A\u9762\u7684\u76EE\u6807\u9875\uFF1B`,
    `2. \u5408\u5E76\u5230 \`${WIKI_LAYOUT.wikiDir}/${input.target}.md\`\uFF08create \u65F6\u65B0\u5EFA\uFF09\uFF1B`,
    `3. \u5220\u9664\u672C\u63D0\u6848\u6587\u4EF6\uFF0C\u7136\u540E\u8DD1\u4E00\u6B21 lint / \u91CD\u5EFA\u7D22\u5F15\u3002`,
    ""
  ].join("\n");
}
function extractBetween(text, start, end) {
  const from = text.indexOf(start);
  if (from < 0) return void 0;
  const to = text.indexOf(end, from + start.length);
  if (to < 0) return void 0;
  return text.slice(from + start.length, to).replace(/^\n+/, "").replace(/\n+$/, "");
}
var PAGE_START = "<!-- llm-wiki:page:start -->";
var PAGE_END = "<!-- llm-wiki:page:end -->";
function logEntry(input) {
  const stamp = input.now.replace(/\.\d{3}Z$/, "Z");
  const lines = [`## ${stamp} \xB7 ${input.operation}`, `- ${input.summary}`];
  for (const detail of input.details ?? []) lines.push(`- ${detail}`);
  return `${lines.join("\n")}
`;
}
function appendLog(existingText, entry) {
  const base = existingText.trimEnd();
  if (base === "") {
    return [
      stringifyFrontmatter({
        id: "log",
        type: "log",
        title: "\u64CD\u4F5C\u65E5\u5FD7",
        summary: "append-only \u7684\u5199\u5165\u5386\u53F2\u3002",
        status: "active"
      }, CANONICAL_FIELDS).trimEnd(),
      "",
      "# \u64CD\u4F5C\u65E5\u5FD7 \xB7 Log",
      "",
      "> \u53EA\u8FFD\u52A0\uFF0C\u4E0D\u6539\u5199\u3002\u6BCF\u6B21 ingest / write / lint \u90FD\u4F1A\u7559\u4E00\u6761\u3002",
      "",
      entry
    ].join("\n");
  }
  return `${base}

${entry}`;
}
function buildRawText(input) {
  const date = input.now.slice(0, 10);
  const frontmatter = stringifyFrontmatter({
    id: `raw/${input.slug}`,
    type: input.type ?? "source",
    title: input.title.trim(),
    summary: input.summary.trim().slice(0, LIMITS.summaryChars),
    status: "stub",
    domain: input.domain ?? "",
    origin: input.origin,
    confirmed: input.confirmed,
    sources: input.sources ?? [],
    created: date,
    updated: date,
    ...input.derivedFrom === void 0 ? {} : { derivedFrom: input.derivedFrom }
  }, RAW_FIELDS);
  return [
    frontmatter,
    `# ${input.title.trim()}`,
    "",
    "## \u7D20\u6750\u539F\u6587",
    "",
    input.body.trim(),
    ""
  ].join("\n");
}
function parseProposal(path, text) {
  const parsed = parseDocument(text);
  const target = typeof parsed.data.proposal_target === "string" ? parsed.data.proposal_target : "";
  const action = typeof parsed.data.proposal_action === "string" ? parsed.data.proposal_action : "";
  if (target === "" || action === "") return null;
  const section = findSection(parsed.body, "\u62DF\u5199\u5165\u5185\u5BB9");
  const body = extractBetween(parsed.body, PAGE_START, PAGE_END) ?? (section === void 0 ? parsed.body : parsed.body.split("\n").slice(section.startLine - 1, section.endLine - 1).join("\n"));
  return {
    path,
    meta: {
      target,
      action,
      base: typeof parsed.data.proposal_base === "string" && parsed.data.proposal_base !== "none" ? parsed.data.proposal_base : void 0,
      reason: typeof parsed.data.proposal_reason === "string" ? parsed.data.proposal_reason : void 0,
      generatedAt: typeof parsed.data.proposal_generated_at === "string" ? parsed.data.proposal_generated_at : void 0
    },
    body: body.trim(),
    text
  };
}

// core/index-page.ts
var TYPE_LABEL = {
  concept: "\u6982\u5FF5",
  entity: "\u5B9E\u4F53",
  source: "\u6765\u6E90",
  answer: "\u56DE\u7B54",
  project: "\u9879\u76EE"
};
function truncate(text, limit) {
  const single = text.replace(/\s+/g, " ").trim();
  if (single.length <= limit) return single;
  return `${single.slice(0, Math.max(0, limit - 1))}\u2026`;
}
function entryLine(snapshot, page) {
  const inbound = snapshot.inbound.get(page.id) ?? 0;
  const tags = page.tags.slice(0, 3).map((tag) => `#${tag}`).join(" ");
  const parts = [
    truncate(page.summary, LIMITS.snippetChars) || "\uFF08\u5F85\u8865\u6458\u8981\uFF09",
    tags,
    page.updated || "",
    inbound > 0 ? `\u2190${inbound}` : ""
  ].filter((part) => part !== "");
  return `- [[${page.id}|${page.title}]] \u2014 ${parts.join(" \xB7 ")}`;
}
function renderIndex(snapshot, options) {
  const date = options.updated.slice(0, 10);
  const content = snapshot.pages.filter((page) => CONTENT_TYPES.includes(page.type));
  const grouped = /* @__PURE__ */ new Map();
  for (const page of content) {
    const list = grouped.get(page.type) ?? [];
    list.push(page);
    grouped.set(page.type, list);
  }
  const counts = CONTENT_TYPES.map((type) => [type, grouped.get(type)?.length ?? 0]).filter(([, count]) => count > 0);
  const lines = [
    stringifyFrontmatter({
      id: "index",
      type: "index",
      title: "\u77E5\u8BC6\u5E93\u7D22\u5F15",
      summary: "\u5168\u5E93\u76EE\u5F55\uFF1A\u5148\u8BFB\u8FD9\u91CC\uFF0C\u518D\u6309\u9700\u6253\u5F00\u9875\u9762\u3002",
      status: "active",
      created: date,
      updated: date
    }, CANONICAL_FIELDS).trimEnd(),
    "",
    "# \u7D22\u5F15 \xB7 Index",
    "",
    "> \u672C\u9875\u7531 llm-wiki \u81EA\u52A8\u751F\u6210\uFF0C\u8BF7\u52FF\u624B\u5DE5\u7F16\u8F91\u3002\u589E\u5220\u9875\u9762\u540E\u91CD\u65B0\u8FD0\u884C\u7D22\u5F15\u91CD\u5EFA\uFF08DSH \u91CC\u662F `wiki_lint --fix`\uFF0CObsidian \u91CC\u662F\u547D\u4EE4\u300CLLM Wiki\uFF1A\u91CD\u5EFA\u7D22\u5F15\u300D\uFF09\u3002",
    "",
    `\u5171 ${content.length} \u9875${counts.length > 0 ? ` \xB7 ${counts.map(([type, count]) => `${TYPE_LABEL[type] ?? type} ${count}`).join(" \xB7 ")}` : ""}`,
    ""
  ];
  for (const type of CONTENT_TYPES) {
    const pages = grouped.get(type);
    if (!pages || pages.length === 0) continue;
    lines.push(`## ${TYPE_LABEL[type] ?? type} \xB7 ${PAGE_TYPE_SEGMENT[type]} \xB7 ${pages.length}`, "");
    pages.slice().sort((left, right) => left.title.localeCompare(right.title, "zh-Hans-CN")).forEach((page) => lines.push(entryLine(snapshot, page)));
    lines.push("");
  }
  if (content.length === 0) {
    lines.push("\uFF08\u7A7A\u5E93\uFF09\u5148\u6536\u5F55\u4E00\u4EFD `raw/` \u6765\u6E90\uFF0C\u518D\u8BA9 agent \u5199\u7B2C\u4E00\u9875\u3002", "");
  }
  return `${lines.join("\n").replace(/\n+$/, "")}
`;
}
function parseIndexEntries(text) {
  const ids = /* @__PURE__ */ new Set();
  const pattern = /^\s*-\s*\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gm;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const id = match[1].trim().replace(/\.md$/, "");
    if (id !== "") ids.add(id);
  }
  return [...ids];
}

// core/lint.ts
var SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };
function daysBetween(from, to) {
  const start = Date.parse(from.length === 10 ? `${from}T00:00:00Z` : from);
  const end = Date.parse(to.length === 10 ? `${to}T00:00:00Z` : to);
  if (Number.isNaN(start) || Number.isNaN(end)) return void 0;
  return Math.floor((end - start) / 864e5);
}
function finding(code, page, message, target) {
  return { code, severity: RULES[code].severity, page, message, target };
}
function lintSnapshot(snapshot, options = {}) {
  const findings = [...snapshot.problems];
  const now = options.now ?? (/* @__PURE__ */ new Date()).toISOString();
  const staleDays = options.staleDays ?? LIMITS.staleDays;
  for (const page of snapshot.pages) {
    if (page.type === "index" || page.type === "log") continue;
    for (const issue of page.schemaIssues) findings.push(finding("L003-schema", page.id, issue));
    if (page.summary.length > LIMITS.summaryChars) {
      findings.push(finding("L006-summary-long", page.id, `summary ${page.summary.length} \u5B57\uFF0C\u4E0A\u9650 ${LIMITS.summaryChars}`));
    }
    const links = snapshot.linksById.get(page.id) ?? [];
    for (const link of links) {
      if (!link.resolved) findings.push(finding("L002-broken-link", page.id, `\u7B2C ${link.line} \u884C\u65AD\u94FE\uFF1A[[${link.raw}]]`, link.raw));
    }
    const related = links.filter((link) => link.inRelated && link.resolved && link.resolved !== page.id);
    if (related.length === 0) {
      findings.push(finding("L010-no-links", page.id, `\u7F3A\u5C11 \`${LIMITS.relatedSection}\` \u51FA\u94FE\uFF1B\u5B64\u7ACB\u77E5\u8BC6\u65E0\u6CD5\u88AB\u904D\u5386\u5230`));
    }
    const inbound = backlinksOf(snapshot, page.id);
    if (inbound.length === 0 && page.status !== "stub") {
      findings.push(finding("L001-orphan", page.id, `\u6CA1\u6709\u4EFB\u4F55\u5165\u94FE\uFF1B\u5728\u522B\u7684\u9875 \`${LIMITS.relatedSection}\` \u91CC\u8865\u4E00\u6761`));
    }
    if (page.status !== "stub" && page.status !== "deprecated" && page.sources.length === 0 && page.type !== "answer") {
      findings.push(finding("L008-uncited", page.id, "\u975E stub \u9875\u6CA1\u6709 sources \u51FA\u5904"));
    }
    if (page.status === "active" || page.status === "contested") {
      const age = daysBetween(page.updated, now);
      if (age !== void 0 && age > staleDays) {
        findings.push(finding("L011-stale", page.id, `\u5DF2 ${age} \u5929\u672A\u66F4\u65B0\uFF08\u9608\u503C ${staleDays}\uFF09`));
      }
    }
  }
  const indexPage = snapshot.byId.get("index");
  if (!indexPage) {
    findings.push(finding("L005-dangling-index", "index", "\u7F3A\u5C11 wiki/index.md\uFF1B\u5148\u91CD\u5EFA\u7D22\u5F15"));
  } else if (options.indexText !== void 0) {
    const declared = new Set(parseIndexEntries(options.indexText));
    for (const page of snapshot.pages) {
      if (!CONTENT_TYPES.includes(page.type)) continue;
      if (!declared.has(page.id)) findings.push(finding("L004-unindexed", page.id, "\u672A\u767B\u8BB0\u5728 index.md"));
    }
    for (const id of declared) {
      if (!snapshot.byId.has(id)) findings.push(finding("L005-dangling-index", "index", `\u7D22\u5F15\u6761\u76EE\u6307\u5411\u4E0D\u5B58\u5728\u7684\u9875\uFF1A${id}`, id));
    }
  }
  if ((options.proposalCount ?? 0) > 0) {
    findings.push(finding("L012-proposal-pending", "index", `${WIKI_LAYOUT.proposalDir}/ \u6709 ${options.proposalCount} \u4EFD\u5F85\u5904\u7406\u63D0\u6848`));
  }
  return findings.sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || left.code.localeCompare(right.code) || left.page.localeCompare(right.page));
}
function summarize(findings) {
  return findings.reduce((counts, item) => {
    counts[item.severity] += 1;
    return counts;
  }, { error: 0, warn: 0, info: 0 });
}
function fixableFindings(findings) {
  return findings.filter((item) => RULES[item.code].fixable);
}
function pageHealth(snapshot, page, findings) {
  const issues = findings.filter((item) => item.page === page.id);
  const worst = issues.some((item) => item.severity === "error") ? "error" : issues.length > 0 ? "warn" : "ok";
  return { status: worst, issues };
}

// core/search.ts
function bigramsOf(text) {
  const normalized = text.toLowerCase().replace(/[\s\p{P}]+/gu, " ").trim();
  const grams = /* @__PURE__ */ new Set();
  for (const word of normalized.split(" ")) {
    if (word === "") continue;
    if (/^[\x00-\x7F]+$/.test(word)) {
      if (word.length > 1) grams.add(word);
      continue;
    }
    const chars = [...word];
    if (chars.length === 1) grams.add(chars[0]);
    for (let index = 0; index + 1 < chars.length; index += 1) {
      grams.add(`${chars[index]}${chars[index + 1]}`);
    }
  }
  return grams;
}
function tokensOf(query) {
  return query.toLowerCase().split(/\s+/).map((token) => token.trim()).filter((token) => token !== "");
}
function clip(text, limit) {
  const single = text.replace(/\s+/g, " ").trim();
  if (single.length <= limit) return single;
  return `${single.slice(0, Math.max(0, limit - 1))}\u2026`;
}
function searchPages(snapshot, query, options = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20));
  const queryTokens = tokensOf(query);
  const queryGrams = queryTokens.length === 0 ? /* @__PURE__ */ new Set() : bigramsOf(query);
  const hits = [];
  for (const page of snapshot.pages) {
    if (page.type === "index" || page.type === "log") continue;
    if (options.types && options.types.length > 0 && !options.types.includes(page.type)) continue;
    if (options.includeStubs === false && page.status === "stub") continue;
    if (options.includeDeprecated !== true && page.status === "deprecated") continue;
    if (options.domain !== void 0 && options.domain !== "" && (page.domain ?? "") !== options.domain) continue;
    if (options.tags && options.tags.length > 0) {
      const pageTags = page.tags.map((tag) => tag.toLowerCase());
      if (!options.tags.every((tag) => pageTags.includes(tag.toLowerCase()))) continue;
    }
    const matched = [];
    let score = 0;
    if (queryTokens.length === 0) {
      score = (snapshot.inbound.get(page.id) ?? 0) * 2;
    } else {
      const title = page.title.toLowerCase();
      const id = page.id.toLowerCase();
      const aliases = page.aliases.map((alias) => alias.toLowerCase());
      const tags = page.tags.map((tag) => tag.toLowerCase());
      const summary = page.summary.toLowerCase();
      const body = stripCode(page.body).toLowerCase();
      let allTokensMatched = true;
      for (const token of queryTokens) {
        let tokenScore = 0;
        let tokenField;
        if (title === token || aliases.includes(token)) {
          tokenScore = 120;
          tokenField = "title";
        } else if (title.startsWith(token)) {
          tokenScore = 90;
          tokenField = "title";
        } else if (aliases.some((alias) => alias.startsWith(token))) {
          tokenScore = 85;
          tokenField = "alias";
        } else if (title.includes(token)) {
          tokenScore = 70;
          tokenField = "title";
        } else if (tags.includes(token)) {
          tokenScore = 60;
          tokenField = "tag";
        } else if (id.includes(token)) {
          tokenScore = 45;
          tokenField = "id";
        } else if (summary.includes(token)) {
          tokenScore = 35;
          tokenField = "summary";
        } else if (body.includes(token)) {
          tokenScore = 15;
          tokenField = "body";
        }
        if (tokenScore === 0) {
          allTokensMatched = false;
          break;
        }
        score += tokenScore;
        if (tokenField && !matched.includes(tokenField)) matched.push(tokenField);
      }
      if (!allTokensMatched) continue;
      const titleGrams = bigramsOf(`${page.title} ${page.aliases.join(" ")}`);
      let overlap2 = 0;
      for (const gram of queryGrams) if (titleGrams.has(gram)) overlap2 += 1;
      if (overlap2 >= 2) {
        score += 25;
        if (!matched.includes("title")) matched.push("title");
      }
      score += Math.min(snapshot.inbound.get(page.id) ?? 0, 10);
    }
    hits.push({
      id: page.id,
      title: page.title,
      type: page.type,
      status: page.status,
      summary: clip(page.summary || page.body.split("\n").find((line) => line.trim() !== "") || "", LIMITS.snippetChars),
      tags: page.tags,
      domain: page.domain,
      updated: page.updated,
      score,
      matched,
      inbound: snapshot.inbound.get(page.id) ?? 0
    });
  }
  return hits.sort((left, right) => right.score - left.score || right.inbound - left.inbound || left.title.localeCompare(right.title, "zh-Hans-CN")).slice(0, limit);
}

// core/dedupe.ts
function gramsOf(text) {
  const normalized = text.toLowerCase().replace(/[\s\p{P}]+/gu, " ").trim();
  const grams = /* @__PURE__ */ new Set();
  for (const word of normalized.split(" ")) {
    if (word === "") continue;
    if (/^[\x00-\x7F]+$/.test(word)) {
      if (word.length > 1) grams.add(word);
      continue;
    }
    const chars = [...word];
    if (chars.length === 1) grams.add(chars[0]);
    for (let index = 0; index + 1 < chars.length; index += 1) {
      grams.add(`${chars[index]}${chars[index + 1]}`);
    }
  }
  return grams;
}
function jaccard(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}
function overlap(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / Math.min(left.size, right.size);
}
function titleSimilarity(left, right) {
  return (jaccard(left, right) + overlap(left, right)) / 2;
}
function neighborsOf(page, snapshot) {
  const links = snapshot.linksById.get(page.id) ?? [];
  return new Set(links.filter((link) => link.inRelated && link.resolved).map((link) => link.resolved));
}
function dedupe(snapshot, options = {}) {
  const threshold = options.threshold ?? LIMITS.dupThreshold;
  const limit = options.limit ?? LIMITS.dupMaxPairs;
  const pages = snapshot.pages.filter((page) => page.type !== "index" && page.type !== "log" && page.status !== "deprecated");
  const pairs = [];
  for (let leftIndex = 0; leftIndex < pages.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < pages.length; rightIndex += 1) {
      const left = pages[leftIndex];
      const right = pages[rightIndex];
      if (left.type !== right.type) continue;
      const leftTitle = gramsOf(`${left.title} ${left.aliases.join(" ")}`);
      const rightTitle = gramsOf(`${right.title} ${right.aliases.join(" ")}`);
      const titleScore = titleSimilarity(leftTitle, rightTitle);
      const leftAlias = gramsOf(left.aliases.join(" "));
      const rightAlias = gramsOf(right.aliases.join(" "));
      const leftNeighbors = neighborsOf(left, snapshot);
      const rightNeighbors = neighborsOf(right, snapshot);
      const dims = [{ score: titleScore, weight: 0.6 }];
      if (leftAlias.size > 0 && rightAlias.size > 0) dims.push({ score: jaccard(leftAlias, rightAlias), weight: 0.2 });
      if (leftNeighbors.size > 0 && rightNeighbors.size > 0) dims.push({ score: jaccard(leftNeighbors, rightNeighbors), weight: 0.2 });
      const total = dims.reduce((sum, dim) => sum + dim.weight, 0);
      const similarity = dims.reduce((sum, dim) => sum + dim.score * dim.weight, 0) / total;
      if (similarity < threshold) continue;
      const leftInbound = snapshot.inbound.get(left.id) ?? 0;
      const rightInbound = snapshot.inbound.get(right.id) ?? 0;
      const keep = leftInbound > rightInbound ? left : leftInbound < rightInbound ? right : stripCode(left.body).length >= stripCode(right.body).length ? left : right;
      const drop = keep.id === left.id ? right : left;
      pairs.push({ keep: keep.id, drop: drop.id, similarity });
    }
  }
  return pairs.sort((left, right) => right.similarity - left.similarity).slice(0, limit);
}

// host/media.ts
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
var MAX_BUFFER = 16 * 1024 * 1024;
function run(bin, args) {
  return new Promise((resolve2, reject) => {
    execFile(bin, args, { maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(Object.assign(new Error((stderr || error.message).trim().slice(0, 300)), { code: "E_BIN" }));
        return;
      }
      resolve2(stdout);
    });
  });
}
async function hasBinary(bin) {
  try {
    await run(bin, ["-version"]);
    return true;
  } catch {
    try {
      await run(bin, ["--version"]);
      return true;
    } catch {
      return false;
    }
  }
}
var AUDIO_EXT = /\.(mp3|m4a|wav|aac|flac|ogg|opus|wma|amr|mp4|mov|mkv|webm|avi)$/i;
async function probe(absolute) {
  if (!await hasBinary("ffprobe")) return void 0;
  try {
    const out = await run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "format=duration:stream=sample_rate,channels",
      "-of",
      "json",
      absolute
    ]);
    const parsed = JSON.parse(out);
    const duration = Number(parsed.format?.duration ?? "");
    if (!Number.isFinite(duration) || duration <= 0) return void 0;
    const stream = parsed.streams?.[0];
    return {
      durationSeconds: Math.round(duration),
      sampleRate: stream?.sample_rate === void 0 ? void 0 : Number(stream.sample_rate),
      channels: stream?.channels
    };
  } catch {
    return void 0;
  }
}
async function slice(absolute, outDir, chunkSeconds, totalSeconds) {
  if (!await hasBinary("ffmpeg")) return void 0;
  const { mkdir: mkdir4 } = await import("node:fs/promises");
  await mkdir4(outDir, { recursive: true });
  try {
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      absolute,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "segment",
      "-segment_time",
      String(chunkSeconds),
      "-reset_timestamps",
      "1",
      join(outDir, "part-%02d.m4a")
    ]);
  } catch {
    return void 0;
  }
  const names = (await readdir(outDir)).filter((name2) => name2.startsWith("part-")).sort();
  if (names.length === 0) return void 0;
  const parts = names.map((name2, index) => {
    const seconds = Math.min(chunkSeconds, Math.max(0, totalSeconds - index * chunkSeconds));
    return { name: name2, seconds };
  });
  return { directory: outDir, parts };
}
async function localWhisper() {
  const candidates = ["whisper-cli", "whisper", "main"];
  let bin;
  for (const candidate of candidates) {
    if (await hasBinary(candidate)) {
      bin = candidate;
      break;
    }
  }
  if (bin === void 0) return void 0;
  return async (absolute) => {
    const work = await mkdtemp(join(tmpdir(), "wiki-asr-"));
    try {
      await run(bin, ["-f", absolute, "-otxt", "-of", join(work, "out"), "-np"]);
      const text = await readFile(join(work, "out.txt"), "utf8");
      return text.trim();
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  };
}
async function apiTranscriber() {
  const endpoint = process.env.DSH_WIKI_ASR_URL ?? "";
  const key = process.env.DSH_WIKI_ASR_KEY ?? "";
  if (endpoint === "" || key === "") return void 0;
  const model = process.env.DSH_WIKI_ASR_MODEL ?? "whisper-1";
  return async (absolute) => {
    const bytes = await readFile(absolute);
    const form = new FormData();
    form.append("model", model);
    form.append("response_format", "json");
    form.append("file", new Blob([bytes], { type: "audio/mp4" }), basename(absolute));
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form
    });
    if (!response.ok) {
      throw Object.assign(new Error(`ASR \u63A5\u53E3 ${response.status}`), { code: "E_RATE_LIMIT" });
    }
    const payload = await response.json();
    return (payload.text ?? "").trim();
  };
}
async function makeTranscriber(provider) {
  if (provider === "none") return { ok: false, reason: "audioProvider=none\uFF1A\u97F3\u89C6\u9891\u53EA\u5B58\u6863\uFF0C\u4E0D\u8F6C\u5199" };
  if (provider === "whisper") {
    const local = await localWhisper();
    if (local === void 0) return { ok: false, reason: "\u627E\u4E0D\u5230 whisper \u547D\u4EE4\u884C\uFF08whisper-cli / whisper / main \u90FD\u4E0D\u5728 PATH\uFF09" };
    return { ok: true, transcribe: local };
  }
  const api = await apiTranscriber();
  if (api === void 0) {
    return { ok: false, reason: "\u7F3A\u5C11 DSH_WIKI_ASR_URL / DSH_WIKI_ASR_KEY \u73AF\u5883\u53D8\u91CF\uFF08api \u901A\u9053\u4E0D\u8D70\u914D\u7F6E\u6587\u4EF6\uFF09" };
  }
  return { ok: true, transcribe: api };
}
function mergeParts(parts) {
  return parts.map((part) => {
    const minutes = Math.floor(part.startSeconds / 60);
    const seconds = part.startSeconds % 60;
    const stamp = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `### \u7B2C ${part.index} \u6BB5 \xB7 ${stamp}

${part.text === "" ? "\uFF08\u8FD9\u4E00\u6BB5\u6CA1\u6709\u8BC6\u522B\u5230\u8BED\u97F3\uFF09" : part.text}`;
  }).join("\n\n");
}

// host/pdf.ts
import { execFile as execFile2 } from "node:child_process";
import { readFile as readFile2 } from "node:fs/promises";
import { inflateSync, inflateRawSync } from "node:zlib";
var MIN_USEFUL_CHARS = 200;
function decodeStream(data) {
  for (const inflate of [inflateSync, inflateRawSync]) {
    try {
      return inflate(data);
    } catch {
      continue;
    }
  }
  return void 0;
}
function unescapePdfString(raw) {
  let out = "";
  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[index + 1];
    index += 1;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "	";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (next !== void 0 && /[0-7]/.test(next)) {
      let octal = next;
      while (octal.length < 3 && index + 1 < raw.length && /[0-7]/.test(raw[index + 1] ?? "")) {
        octal += raw[index + 1];
        index += 1;
      }
      out += String.fromCharCode(parseInt(octal, 8));
    }
  }
  return out;
}
function textOfContent(content) {
  const pieces = [];
  const literal = /\((?:\\.|[^\\)])*\)/g;
  const showText = /(\[[^\]]*\]|\((?:\\.|[^\\)])*\))\s*(Tj|TJ|'|")/g;
  let match;
  while ((match = showText.exec(content)) !== null) {
    const chunk = match[1] ?? "";
    if (chunk.startsWith("[")) {
      literal.lastIndex = 0;
      let inner;
      const segment = [];
      while ((inner = literal.exec(chunk)) !== null) {
        segment.push(unescapePdfString(inner[0].slice(1, -1)));
      }
      pieces.push(segment.join(""));
    } else {
      pieces.push(unescapePdfString(chunk.slice(1, -1)));
    }
    if (match[2] === "Tj" || match[2] === "TJ") pieces.push(" ");
  }
  return pieces.join("");
}
function usefulRatio(text) {
  const compact = text.replace(/\s+/g, "");
  if (compact === "") return 0;
  let useful = 0;
  for (const ch of compact) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code <= 126) useful += 1;
    else if (code >= 19968 && code <= 40959) useful += 1;
    else if (code >= 12288 && code <= 12351) useful += 1;
    else if (code >= 65280 && code <= 65381) useful += 1;
  }
  return useful / [...compact].length;
}
async function extractPdfViaPython(absolute) {
  const script = [
    "import json,sys",
    "try:",
    "    from pypdf import PdfReader",
    "except Exception:",
    '    print(json.dumps({"ok": False, "why": "no pypdf"})); raise SystemExit(0)',
    "reader = PdfReader(sys.argv[1])",
    'pages = [p.extract_text() or "" for p in reader.pages]',
    'print(json.dumps({"ok": True, "pages": len(pages), "text": "\\n\\n".join(pages)}, ensure_ascii=False))'
  ].join("\n");
  const out = await new Promise((resolve2, reject) => {
    execFile2("python3", ["-c", script, absolute], { maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      if (error !== null) reject(error);
      else resolve2(stdout);
    });
  }).catch(() => "");
  if (out.trim() === "") return void 0;
  let payload;
  try {
    payload = JSON.parse(out);
  } catch {
    return void 0;
  }
  if (payload.ok !== true || typeof payload.text !== "string") return void 0;
  const text = payload.text.replace(/[ \t]{2,}/g, " ").trim();
  if (text.length < MIN_USEFUL_CHARS) return void 0;
  return {
    text,
    note: `python3 + pypdf \u62BD\u53D6\uFF1A${payload.pages ?? 0} \u9875`
  };
}
async function extractPdfText(absolute) {
  const bytes = await readFile2(absolute);
  if (bytes.length === 0) return void 0;
  const streams = [];
  const streamPattern = /stream\r?\n/g;
  const content = bytes.toString("latin1");
  let match;
  while ((match = streamPattern.exec(content)) !== null) {
    const start = match.index + match[0].length;
    const end = bytes.indexOf(Buffer.from("endstream"), start);
    if (end < 0) break;
    const payload = bytes.subarray(start, end);
    const inflated = decodeStream(payload);
    if (inflated === void 0) continue;
    streams.push(inflated.toString("latin1"));
    streamPattern.lastIndex = end;
  }
  const merged = streams.map(textOfContent).join("\n").replace(/[ \t]{2,}/g, " ").trim();
  const ratio = usefulRatio(merged);
  if (merged.length < MIN_USEFUL_CHARS || ratio < 0.7) return void 0;
  return {
    text: merged,
    note: `\u7EAF JS \u62BD\u53D6\uFF08\u672A\u88C5 pdftotext\uFF09\uFF1A${streams.length} \u4E2A\u5185\u5BB9\u6D41\uFF0C\u53EF\u8BFB\u5B57\u7B26\u5360\u6BD4 ${(ratio * 100).toFixed(0)}%`
  };
}

// host/git.ts
import { execFile as execFile3 } from "node:child_process";
import { join as join2 } from "node:path";
var MAX_BUFFER2 = 8 * 1024 * 1024;
function runRaw(cwd, args) {
  return new Promise((resolve2, reject) => {
    execFile3("git", ["-C", cwd, ...args], { maxBuffer: MAX_BUFFER2 }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(Object.assign(new Error((stderr || error.message).trim()), { code: error.code }));
        return;
      }
      resolve2(stdout);
    });
  });
}
function run2(cwd, args) {
  return new Promise((resolve2, reject) => {
    execFile3("git", ["-C", cwd, ...args], { maxBuffer: MAX_BUFFER2 }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(Object.assign(new Error((stderr || error.message).trim()), { code: error.code }));
        return;
      }
      resolve2(stdout.trim());
    });
  });
}
async function inspectRepo(root) {
  try {
    await run2(root, ["--version"]);
  } catch {
    return { ok: false, code: "E_NO_GIT", message: "\u8FD9\u53F0\u673A\u5668\u4E0A\u6CA1\u6709\u53EF\u7528\u7684 git \u547D\u4EE4" };
  }
  try {
    const top = await run2(root, ["rev-parse", "--show-toplevel"]);
    if (top === "") return { ok: false, code: "E_NOT_A_REPO", message: "\u5E93\u4E0D\u662F git \u4ED3\u5E93" };
    return { ok: true };
  } catch {
    return { ok: false, code: "E_NOT_A_REPO", message: `\u5E93\u6839\u4E0D\u662F git \u4ED3\u5E93\uFF1A${join2(root, ".git")} \u4E0D\u5B58\u5728\u3002\u56DE\u6EDA\u9700\u8981\u5148 git init \u5E76\u63D0\u4EA4\u4E00\u6B21` };
  }
}
async function recentCommits(root, limit = 20) {
  const format = "%H%x09%cI%x09%s";
  const out = await run2(root, ["log", `-n${limit}`, `--format=${format}`, "--", "2-wiki", "3-review"]);
  if (out === "") return [];
  return out.split("\n").map((line) => {
    const [hash, date, subject] = line.split("	");
    return { hash: hash ?? "", date: date ?? "", subject: subject ?? "" };
  }).filter((commit) => commit.hash !== "");
}
async function dirtyPaths(root) {
  const out = await runRaw(root, ["status", "--porcelain=v1", "-z", "--", "2-wiki", "3-review"]);
  if (out === "") return [];
  return out.split("\0").filter((entry) => entry.length > 3).map((entry) => entry.slice(3)).filter((path) => path !== "2-wiki" && path !== "3-review");
}
async function commitLibrary(root, message) {
  const dirty = await dirtyPaths(root);
  if (dirty.length === 0) return null;
  await run2(root, ["add", "--", ...dirty]);
  await run2(root, [
    "-c",
    "user.name=llm-wiki",
    "-c",
    "user.email=llm-wiki@local",
    "commit",
    "--no-verify",
    "-m",
    message,
    "--",
    ...dirty
  ]);
  const hash = await run2(root, ["rev-parse", "--short", "HEAD"]);
  return hash;
}
async function restoreTree(root, commit) {
  let tracked;
  try {
    tracked = await run2(root, ["ls-tree", "-r", "--name-only", commit, "--", "2-wiki", "3-review"]);
  } catch {
    throw Object.assign(new Error(`\u63D0\u4EA4 ${commit} \u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u8BFB`), { code: "E_BAD_COMMIT" });
  }
  const files = tracked.split("\n").filter((path) => path !== "");
  if (files.length === 0) throw Object.assign(new Error(`\u63D0\u4EA4 ${commit} \u91CC\u6CA1\u6709 2-wiki / 3-review`), { code: "E_BAD_COMMIT" });
  const listed = new Set(files);
  let current = [];
  try {
    current = (await run2(root, ["ls-files", "--", "2-wiki", "3-review"])).split("\n").filter((path) => path !== "");
  } catch {
    current = [];
  }
  const extras = current.filter((path) => !listed.has(path));
  await run2(root, ["checkout", commit, "--", ...files]);
  return { restored: files, extras };
}
async function restoreFile(root, commit, relPath) {
  try {
    await run2(root, ["cat-file", "-e", `${commit}:${relPath}`]);
  } catch {
    throw Object.assign(new Error(`\u63D0\u4EA4 ${commit} \u91CC\u6CA1\u6709 ${relPath}`), { code: "E_BAD_COMMIT" });
  }
  await run2(root, ["checkout", commit, "--", relPath]);
}

// host/actions.ts
var ActionError = class extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "ActionError";
  }
};
var TEXT_FILE_EXT = /\.(md|markdown|txt|json|csv|yaml|yml|log|xml|html?)$/i;
function splitUploadPath(raw) {
  const parts = raw.replace(/\\/g, "/").split("/").map((part) => part.trim()).filter((part) => part !== "" && part !== "." && part !== "..").map((part) => part.replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(0, 60));
  const name2 = parts.pop() ?? "upload.bin";
  return { dir: parts.slice(-6).join("/"), name: name2 === "" ? "upload.bin" : name2 };
}
function emptyReceipt(action) {
  return { action, changed: 0, created: 0, removed: 0, ms: 0, notes: [] };
}
function uniqueSlug(snapshot, base) {
  const taken = new Set([...snapshot.byId.keys(), ...snapshot.raw.keys()].map((id) => id.split("/").slice(1).join("/")));
  let slug = base;
  let index = 2;
  while (taken.has(slug)) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}
function clip2(text, limit) {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length <= limit ? single : `${single.slice(0, Math.max(0, limit - 1))}\u2026`;
}
function firstSentence(body) {
  const lines = stripCode(body).split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith(">"));
  return clip2(lines[0] ?? "", LIMITS.summaryChars);
}
function checkPageBody(text, targetId, snapshot, root) {
  const errors = [];
  const parsed = parseDocument(text);
  if (!parsed.hasFrontmatter) {
    errors.push("\u7F3A\u5C11 frontmatter");
    return errors;
  }
  const fm = parsed.data;
  if (typeof fm.id !== "string" || fm.id.trim() !== targetId) errors.push(`id \u5FC5\u987B\u662F ${targetId}`);
  const declaredType = typeof fm.type === "string" ? fm.type : "";
  if (!CONTENT_TYPES.includes(declaredType)) errors.push(`type \u5FC5\u987B\u662F ${CONTENT_TYPES.join(" / ")}`);
  const segment = targetId.split("/")[0] ?? "";
  if (PAGE_TYPE_SEGMENT[declaredType] !== segment) errors.push(`type ${declaredType} \u4E0E\u76EE\u5F55 ${segment} \u4E0D\u4E00\u81F4`);
  if (typeof fm.title !== "string" || fm.title.trim() === "") errors.push("\u7F3A\u5C11 title");
  const summary = typeof fm.summary === "string" ? fm.summary.trim() : "";
  if (summary === "") errors.push("\u7F3A\u5C11 summary");
  if (summary.length > LIMITS.summaryChars) errors.push(`summary \u8D85\u8FC7 ${LIMITS.summaryChars} \u5B57`);
  const status = typeof fm.status === "string" ? fm.status : "stub";
  if (!parsed.body.includes(LIMITS.relatedSection)) errors.push(`\u6B63\u6587\u7F3A\u5C11 \`${LIMITS.relatedSection}\` \u6BB5`);
  const related = extractLinks(parsed.body).filter((link) => link.inRelated);
  if (related.length === 0) errors.push(`\`${LIMITS.relatedSection}\` \u91CC\u81F3\u5C11\u8981\u6709\u4E00\u6761 [[wikilink]]`);
  for (const link of related) {
    const resolved = snapshot.byId.has(link.raw) || snapshot.nameIndex.get(link.raw.trim().toLowerCase()) !== void 0 || link.raw === targetId;
    if (!resolved) errors.push(`\u5173\u8054\u6307\u5411\u4E0D\u5B58\u5728\u7684\u9875\uFF1A[[${link.raw}]]`);
  }
  const sources = Array.isArray(fm.sources) ? fm.sources : [];
  if (sources.length === 0 && status !== "stub" && declaredType !== "answer") {
    errors.push("\u975E stub \u9875\u5FC5\u987B\u6709 sources");
  }
  return errors;
}
var Actions = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  get store() {
    return this.ctx.store;
  }
  /**
   * 统一的执行外壳：加锁、计时、记 log。
   *
   * 注意 `appendLog` 必须在锁**内**执行：它是"读 log → 拼一段 → 写回"的读改写，
   * 放到锁外并发跑会互相覆盖（实测 8 个并发动作丢 2 条日志）。
   */
  async run(action, summary, task, details = []) {
    const started = Date.now();
    const receipt = emptyReceipt(action);
    const now = this.ctx.now();
    await this.store.exclusive(async () => {
      await task(receipt);
      receipt.ms = Date.now() - started;
      await this.store.appendLog(now, "write", `[${action}] ${summary}`, [
        `changed ${receipt.changed} \xB7 created ${receipt.created} \xB7 removed ${receipt.removed}`,
        ...details
      ]);
    });
    return { receipt };
  }
  // ── A01 灵感落盘 ────────────────────────────────────────────────
  async note(input) {
    const text = input.text.trim();
    if (text === "") throw new ActionError("E_EMPTY", "\u7075\u611F\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
    const { snapshot } = await this.store.load();
    const title = (input.title ?? "").trim() || firstSentence(text).slice(0, 24) || "\u672A\u547D\u540D\u7075\u611F";
    const slug = uniqueSlug(snapshot, `note-${slugify(title)}`);
    const now = this.ctx.now();
    const page = buildRawText({
      slug,
      title,
      summary: firstSentence(text),
      body: text,
      now,
      origin: "note",
      confirmed: "auto",
      domain: input.domain
    });
    return this.run("A01", `\u7075\u611F\u5165\u5E93 ${slug}`, async (receipt) => {
      await this.store.write(`0-inbox/notes/${slug}.md`, page);
      receipt.created = 1;
    });
  }
  // ── A02 文件接收 ────────────────────────────────────────────────
  /**
   * 接收一个文件。
   *
   * `filename` 允许带目录：整目录上传时前端会把相对路径一起送来
   * （`book/ch1/a.md`），这里**保留这段结构**落到 `0-inbox/files/book/ch1/a.md`。
   * 理由：
   * - 收进来的往往是成套资料（一本书的章节、一个文件夹的截图），拍平之后
   *   `ch1/a.md` 与 `ch2/a.md` 会互相撞名，只能靠随机后缀区分，人就看不懂了；
   * - 素材本来就要人工确认，保留路径等于保留了"它原来在哪"这条线索；
   * - 目录里同名不覆盖：第二个同名文件落成 `a-2.md`，原件不动。
   *
   * 安全：路径分段里的 `..`、空段、控制字符全部丢掉；深度最多 6 层、每段最长 60 字符。
   */
  async ingestFile(input) {
    const bytes = input.bytes;
    if (bytes.byteLength === 0) throw new ActionError("E_EMPTY", "\u7A7A\u6587\u4EF6");
    if (bytes.byteLength > LIMITS.uploadBytes) {
      throw new ActionError("E_TOO_LARGE", `\u6587\u4EF6\u8D85\u8FC7 ${Math.round(LIMITS.uploadBytes / 1024 / 1024)} MB`);
    }
    const { snapshot } = await this.store.load();
    const { dir, name: name2 } = splitUploadPath(input.filename.trim() || "upload.bin");
    const stem = name2.replace(/\.[^.]+$/, "");
    const ext = (name2.match(/\.([^.]+)$/)?.[1] ?? "bin").toLowerCase();
    const slugBase = `file-${slugify(stem)}`;
    let slug = uniqueSlug(snapshot, slugBase);
    let slugAttempt = 2;
    while (await this.store.exists(`${WIKI_LAYOUT.inboxNotes}/${slug}.md`)) {
      slug = `${slugBase}-${slugAttempt}`;
      slugAttempt += 1;
      if (slugAttempt > 500) break;
    }
    const targetDir = dir === "" ? WIKI_LAYOUT.inboxFiles : `${WIKI_LAYOUT.inboxFiles}/${dir}`;
    const stored = await this.uniqueStoredPath(targetDir, name2);
    const now = this.ctx.now();
    const kind = TEXT_FILE_EXT.test(name2) ? "text" : "binary";
    const shownPath = dir === "" ? name2 : `${dir}/${name2}`;
    const page = buildRawText({
      slug,
      title: stem === "" ? name2 : stem,
      summary: `${kind === "text" ? "\u6587\u672C" : "\u4E8C\u8FDB\u5236"}\u6587\u4EF6 ${shownPath}\uFF0C\u7B49\u5F85\u62BD\u53D6\u6216\u8F6C\u5199`,
      body: [
        `- \u539F\u59CB\u6587\u4EF6\uFF1A\`${stored}\`\uFF08${ext}\uFF0C${Math.round(bytes.byteLength / 1024)} KB\uFF09`,
        `- \u63A5\u6536\u65F6\u95F4\uFF1A${now}`,
        "",
        kind === "text" ? "\u6587\u672C\u7C7B\u6587\u4EF6\u53EF\u4EE5\u76F4\u63A5\u8FDB\u5165\u9884\u5904\u7406\u3002" : "\u8BE5\u7C7B\u578B\u9700\u8981\u9884\u5904\u7406\u901A\u9053\uFF08PDF / \u56FE\u7247 / \u97F3\u89C6\u9891\uFF09\uFF0C\u672A\u542F\u7528\u65F6\u4EC5\u4F5C\u5B58\u6863\u3002"
      ].join("\n"),
      now,
      origin: "upload",
      confirmed: "auto",
      domain: input.domain,
      derivedFrom: stored,
      type: "source"
    });
    return this.run("A02", `\u63A5\u6536\u6587\u4EF6 ${shownPath}`, async (receipt) => {
      const { mkdir: mkdir4, writeFile: writeFile4 } = await import("node:fs/promises");
      const { dirname: dirname4 } = await import("node:path");
      const absolute = this.store.abs(stored);
      await mkdir4(dirname4(absolute), { recursive: true });
      await writeFile4(absolute, bytes);
      await this.store.write(`0-inbox/notes/${slug}.md`, page);
      receipt.created = 2;
    });
  }
  /** 目录内不覆盖：`a.md` 已存在就落 `a-2.md`、`a-3.md`…（最多 500 次尝试）。 */
  async uniqueStoredPath(dirRel, name2) {
    const dot = name2.lastIndexOf(".");
    const base = dot > 0 ? name2.slice(0, dot) : name2;
    const suffix = dot > 0 ? name2.slice(dot) : "";
    let candidate = `${dirRel}/${name2}`;
    let index = 2;
    while (await this.store.exists(candidate)) {
      candidate = `${dirRel}/${base}-${index}${suffix}`;
      index += 1;
      if (index > 500) break;
    }
    return candidate;
  }
  // ── A03 预处理 ──────────────────────────────────────────────────
  async preprocess(input) {
    const { snapshot } = await this.store.load();
    const rel = input.item.replace(/^0-inbox\//, "");
    const noteRel = rel.endsWith(".md") ? `0-inbox/${rel}` : `0-inbox/notes/${rel}.md`;
    const text = await this.store.read(noteRel);
    const page = parsePage(noteRel, text, this.store.libraryPath);
    const derived = typeof page.frontmatter.derivedFrom === "string" ? page.frontmatter.derivedFrom : void 0;
    if (derived === void 0) throw new ActionError("E_NO_SOURCE", "\u8FD9\u6761\u7D20\u6750\u6CA1\u6709\u539F\u59CB\u6587\u4EF6\uFF0C\u65E0\u9700\u9884\u5904\u7406");
    const ext = (derived.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
    let extracted = "";
    let channel = "";
    const extraLines = [];
    if (TEXT_FILE_EXT.test(derived)) {
      extracted = await this.store.read(derived);
      channel = "text";
    } else if (ext === "pdf") {
      extracted = await extractPdf(this.store.abs(derived)).catch(() => "");
      channel = extracted === "" ? "" : "pdf";
      if (extracted === "") {
        const pypdf = await extractPdfViaPython(this.store.abs(derived)).catch(() => void 0);
        if (pypdf !== void 0) {
          extracted = pypdf.text;
          channel = "pdf-pypdf";
          extraLines.push(`- \u62BD\u53D6\u8BF4\u660E\uFF1A${pypdf.note}`);
        }
      }
      if (extracted === "") {
        const fallback = await extractPdfText(this.store.abs(derived)).catch(() => void 0);
        if (fallback !== void 0) {
          extracted = fallback.text;
          channel = "pdf-js";
          extraLines.push(`- \u62BD\u53D6\u8BF4\u660E\uFF1A${fallback.note}`);
        }
      }
    } else if (AUDIO_EXT.test(derived)) {
      const audio = await this.transcribeAudio(derived, page);
      extracted = audio.text;
      channel = audio.channel;
      extraLines.push(...audio.notes);
    }
    if (extracted === "") {
      throw new ActionError(
        ext === "pdf" ? "E_PDF_UNAVAILABLE" : "E_PREPROCESS_UNAVAILABLE",
        ext === "pdf" ? "PDF \u62BD\u53D6\u901A\u9053\u4E0D\u53EF\u7528\uFF08\u672A\u5B89\u88C5 pdftotext\uFF09\uFF1A\u6587\u4EF6\u5DF2\u5B58\u6863\uFF0C\u4E0D\u963B\u585E" : `\u300C${ext}\u300D\u7C7B\u578B\u6CA1\u6709\u53EF\u7528\u7684\u9884\u5904\u7406\u901A\u9053\uFF1A\u6587\u4EF6\u5DF2\u5B58\u6863\uFF0C\u4E0D\u963B\u585E`,
        { stored: derived }
      );
    }
    const now = this.ctx.now();
    const slug = page.id.split("/").slice(1).join("/");
    const body = [
      `- \u539F\u59CB\u6587\u4EF6\uFF1A\`${derived}\``,
      `- \u62BD\u53D6\u901A\u9053\uFF1A${channel}`,
      `- \u62BD\u53D6\u65F6\u95F4\uFF1A${now}`,
      ...extraLines,
      "",
      "```text",
      extracted.slice(0, 4e4),
      "```"
    ].join("\n");
    return this.run("A03", `\u9884\u5904\u7406 ${slug}\uFF08${channel}\uFF09`, async (receipt) => {
      await this.store.write(`0-inbox/notes/${slug}.md`, buildRawText({
        slug,
        title: page.title,
        summary: clip2(extracted, LIMITS.summaryChars),
        body,
        now,
        origin: "upload",
        confirmed: "auto",
        domain: page.domain,
        derivedFrom: derived,
        type: "source",
        sources: [derived]
      }));
      receipt.changed = 1;
    });
  }
  /**
   * 音视频：探时长 → 超过阈值就切片 → 逐片转写 → 合并。
   * 每一步单独报错，前端能说清是"没装 ffmpeg""没配 ASR"还是"接口限流"。
   */
  async transcribeAudio(derived, page) {
    const provider = this.ctx.audioProvider ?? "none";
    const maxMinutes = this.ctx.audioMaxMinutes ?? 30;
    const chunkMinutes = this.ctx.audioChunkMinutes ?? 10;
    const absolute = this.store.abs(derived);
    if (provider === "none") {
      throw new ActionError(
        "E_PREPROCESS_UNAVAILABLE",
        "audioProvider=none\uFF1A\u97F3\u89C6\u9891\u53EA\u5B58\u6863\u4E0D\u8F6C\u5199\u3002\u8981\u8F6C\u5199\u5C31\u628A\u914D\u7F6E\u6539\u6210 whisper\uFF08\u672C\u673A\u547D\u4EE4\u884C\uFF09\u6216 api\uFF08OpenAI \u517C\u5BB9\u63A5\u53E3\uFF09",
        { stored: derived }
      );
    }
    const transcriber = await makeTranscriber(provider);
    if (!transcriber.ok) {
      throw new ActionError("E_PREPROCESS_UNAVAILABLE", `${transcriber.reason}\uFF1A\u6587\u4EF6\u5DF2\u5B58\u6863\uFF0C\u4E0D\u963B\u585E`, { stored: derived });
    }
    const info = await probe(absolute);
    if (info === void 0) {
      throw new ActionError("E_PREPROCESS_UNAVAILABLE", "\u63A2\u4E0D\u5230\u65F6\u957F\uFF08\u7F3A ffprobe \u6216\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF09\uFF1A\u6587\u4EF6\u5DF2\u5B58\u6863\uFF0C\u4E0D\u963B\u585E", { stored: derived });
    }
    const notes = [`- \u65F6\u957F\uFF1A${Math.floor(info.durationSeconds / 60)} \u5206 ${info.durationSeconds % 60} \u79D2`];
    const slug = page.id.split("/").slice(1).join("/");
    let pieces = [];
    let parts;
    if (info.durationSeconds <= maxMinutes * 60) {
      const text = await transcriber.transcribe(absolute, { part: 1, total: 1 }).catch((error) => {
        throw new ActionError("E_PREPROCESS_UNAVAILABLE", `\u8F6C\u5199\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`, { stored: derived });
      });
      pieces = [{ index: 1, startSeconds: 0, text }];
      notes.push("- \u672A\u5207\u7247\uFF1A\u65F6\u957F\u5728\u9608\u503C\u5185");
    } else {
      const chunkSeconds = Math.max(60, chunkMinutes * 60);
      const outDir = this.store.abs(`0-inbox/files/.parts/${slug}`);
      const { mkdir: mkdir4 } = await import("node:fs/promises");
      await mkdir4(outDir, { recursive: true });
      const sliced = await slice(absolute, outDir, chunkSeconds, info.durationSeconds);
      if (sliced === void 0) {
        throw new ActionError(
          "E_PREPROCESS_UNAVAILABLE",
          `\u5207\u7247\u5931\u8D25\uFF08\u7F3A ffmpeg \u6216\u97F3\u9891\u4E0D\u53EF\u89E3\u7801\uFF09\u3002\u9608\u503C ${maxMinutes} \u5206\u949F\uFF0C\u672C\u6587\u4EF6 ${Math.round(info.durationSeconds / 60)} \u5206\u949F\uFF1A\u6587\u4EF6\u5DF2\u5B58\u6863`,
          { stored: derived }
        );
      }
      parts = { directory: `0-inbox/files/.parts/${slug}`, files: sliced.parts.map((part) => part.name) };
      notes.push(`- \u5DF2\u5207\u7247\uFF1A${sliced.parts.length} \u6BB5 \xD7 \u7EA6 ${chunkMinutes} \u5206\u949F\uFF08\u4E2D\u95F4\u7269\u5728 \`${parts.directory}\`\uFF09`);
      for (const [offset, part] of sliced.parts.entries()) {
        const text = await transcriber.transcribe(join3(outDir, part.name), { part: offset + 1, total: sliced.parts.length }).catch((error) => {
          throw new ActionError(
            "E_PREPROCESS_UNAVAILABLE",
            `\u7B2C ${offset + 1}/${sliced.parts.length} \u6BB5\u8F6C\u5199\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`,
            { stored: derived }
          );
        });
        pieces.push({ index: offset + 1, startSeconds: offset * chunkSeconds, text });
      }
    }
    return {
      text: mergeParts(pieces),
      channel: provider === "whisper" ? "whisper" : "asr-api",
      notes: [...notes, ...parts === void 0 ? [] : [`- \u5207\u7247\u6E05\u5355\uFF1A${parts.files.join("\u3001")}`]]
    };
  }
  // ── A04 采集执行 ────────────────────────────────────────────────
  async collect(input) {
    const urls = (input.urls ?? []).map((url) => url.trim()).filter((url) => url !== "");
    if (urls.length === 0) throw new ActionError("E_NO_SOURCE", "\u91C7\u96C6\u6E90\u4E3A\u7A7A\uFF1A\u5148\u5728\u4EFB\u52A1\u91CC\u914D\u7F6E\u91C7\u96C6\u6E90");
    const maxItems = Math.max(1, Math.min(input.maxItems ?? 5, 20));
    const { snapshot } = await this.store.load();
    const now = this.ctx.now();
    const items = [];
    for (const url of urls.slice(0, maxItems)) {
      try {
        const response = await fetch(url, { headers: { "user-agent": "llm-wiki-collector/1.0" } });
        if (!response.ok) continue;
        const html = await response.text();
        items.push({ title: titleOfHtml(html) || url, text: textOfHtml(html), url });
      } catch {
      }
    }
    if (items.length === 0) throw new ActionError("E_RATE_LIMIT", "\u6240\u6709\u91C7\u96C6\u6E90\u90FD\u5931\u8D25\u4E86\uFF1A\u7A0D\u540E\u91CD\u8BD5\u6216\u6362\u6E90");
    const slug = uniqueSlug(snapshot, `collect-${slugify(input.topic ?? "web")}`);
    const body = items.map((item, index) => [
      `### ${index + 1}. ${item.title}`,
      "",
      `- \u6765\u6E90\uFF1A${item.url}`,
      "",
      item.text.slice(0, 4e3),
      ""
    ].join("\n")).join("\n");
    return this.run("A04", `\u91C7\u96C6 ${items.length} \u6761\uFF08${input.topic ?? "\u672A\u547D\u540D\u4E3B\u9898"}\uFF09`, async (receipt) => {
      await this.store.write(`0-inbox/collect/${slug}.md`, buildRawText({
        slug,
        title: input.topic ?? `\u91C7\u96C6 ${now.slice(0, 10)}`,
        summary: clip2(items.map((item) => item.title).join(" / "), LIMITS.summaryChars),
        body,
        now,
        origin: "collect",
        confirmed: "auto",
        domain: input.domain,
        sources: items.map((item) => item.url),
        type: "source"
      }));
      receipt.created = 1;
      receipt.notes.push(`\u5931\u8D25 ${urls.length - items.length} \u4E2A\u6E90`);
    });
  }
  // ── A05 确认入库 ────────────────────────────────────────────────
  async confirm(input) {
    const { snapshot } = await this.store.load();
    const inbox = await this.inboxItems();
    const picked = input.all === true ? inbox : inbox.filter((item) => (input.items ?? []).some((name2) => name2 === item.rel || name2 === item.slug));
    if (picked.length === 0) throw new ActionError("E_NOT_FOUND", "\u6CA1\u6709\u5339\u914D\u7684\u5F85\u786E\u8BA4\u7D20\u6750");
    return this.run("A05", `\u786E\u8BA4\u5165\u5E93 ${picked.length} \u6761`, async (receipt) => {
      for (const item of picked) {
        const text = await this.store.read(`0-inbox/notes/${item.slug}.md`);
        const page = parsePage(`0-inbox/notes/${item.slug}.md`, text, this.store.libraryPath);
        const confirmed = input.byHuman === true ? "human" : "auto";
        const rawText = text.replace(/^confirmed:\s*\S+$/m, `confirmed: ${confirmed}`).replace(/^status:\s*\S+$/m, "status: stub");
        const target = `${WIKI_LAYOUT.rawDir}/${item.slug}.md`;
        const exists = await this.store.exists(target);
        await this.store.write(`${target}${exists ? ".new" : ""}`, rawText);
        if (exists) {
          receipt.notes.push(`${item.slug} \u5DF2\u5B58\u5728\uFF0C\u672C\u6B21\u843D\u4E3A .new`);
        } else {
          receipt.created += 1;
        }
        const derived = typeof page.frontmatter.derivedFrom === "string" ? page.frontmatter.derivedFrom : void 0;
        if (derived !== void 0 && await this.store.exists(derived)) {
          const attachment = `${WIKI_LAYOUT.attachments}/${basename2(derived)}`;
          if (!await this.store.exists(attachment)) {
            const { rename: rename3 } = await import("node:fs/promises");
            await rename3(this.store.abs(derived), this.store.abs(attachment));
          }
          await this.store.write(target, rawText.replace(derived, attachment));
        }
        await this.store.remove(`0-inbox/notes/${item.slug}.md`);
        receipt.removed += 1;
      }
    });
  }
  /** 待确认素材清单（0-inbox 下的 notes / collect）。 */
  async inboxItems() {
    const items = [];
    for (const dir of [WIKI_LAYOUT.inboxNotes, WIKI_LAYOUT.inboxCollect]) {
      const files = await this.store.listFiles(dir, false);
      for (const file of files) {
        const text = await this.store.read(file);
        const page = parsePage(file, text, this.store.libraryPath);
        const derived = typeof page.frontmatter.derivedFrom === "string" ? page.frontmatter.derivedFrom : "";
        const origin = derived.startsWith(`${WIKI_LAYOUT.inboxFiles}/`) ? derived.slice(WIKI_LAYOUT.inboxFiles.length + 1) : void 0;
        items.push({
          slug: page.id.split("/").slice(1).join("/"),
          rel: file,
          title: page.title,
          updated: page.updated,
          kind: dir === WIKI_LAYOUT.inboxCollect ? "collect" : "note",
          origin
        });
      }
    }
    return items;
  }
  // ── A06 撤回素材 ────────────────────────────────────────────────
  async retract(input) {
    const rel = input.item.replace(/^0-inbox\//, "");
    const candidates = [`0-inbox/${rel}`, `0-inbox/notes/${rel}.md`, `0-inbox/collect/${rel}.md`];
    let target;
    for (const candidate of candidates) {
      if (await this.store.exists(candidate)) {
        target = candidate;
        break;
      }
    }
    if (target === void 0) throw new ActionError("E_NOT_FOUND", `\u627E\u4E0D\u5230\u7D20\u6750 ${input.item}`);
    return this.run("A06", `\u64A4\u56DE\u7D20\u6750 ${target}`, async (receipt) => {
      await this.store.remove(target);
      receipt.removed = 1;
    });
  }
  // ── A07 编译素材（交给 agent）────────────────────────────────────
  async compile(input) {
    const { snapshot } = await this.store.load();
    const raws = [...snapshot.raw.values()];
    const picked = input.all === true ? raws : raws.filter((page) => (input.items ?? []).some((item) => item === page.id || item === page.id.split("/")[1]));
    if (picked.length === 0) throw new ActionError("E_EMPTY_RAW", "1-raw \u91CC\u6CA1\u6709\u53EF\u7F16\u8BD1\u7684\u7D20\u6750\uFF1A\u5148\u786E\u8BA4\u4E00\u6279\u7D20\u6750");
    const instruction = [
      `\u7F16\u8BD1 ${picked.length} \u6761\u7D20\u6750\u4E3A wiki \u9875\u3002\u6B65\u9AA4\uFF1A`,
      ...picked.map((page, index) => `${index + 1}. \`${page.id}\` \u2014 ${page.title}`),
      "",
      "\u5BF9\u6BCF\u4E00\u6761\uFF1A\u5148 wiki_search \u67E5\u91CD\uFF08\u540C\u4E3B\u9898\u5C31\u522B\u65B0\u5EFA\uFF09\uFF0C\u518D\u8BFB\u5DF2\u5B58\u5728\u7684\u76F8\u5173\u9875\uFF1B",
      "\u7136\u540E wiki_write\uFF08mode=propose\uFF09\u5199\u4E00\u5F20\u5B8C\u6574\u9875\u9762\uFF1A",
      "- \u4E00\u9875\u53EA\u8BB2\u4E00\u4EF6\u4E8B\uFF0Ctitle/summary \u5404\u81EA\u72EC\u7ACB\u53EF\u8BFB\uFF1B",
      "`## \u5173\u8054` \u81F3\u5C11\u4E00\u6761\u6307\u5411\u5DF2\u5B58\u5728\u7684\u9875\uFF08\u627E\u4E0D\u5230\u5C31\u5148\u8865\u4E00\u5F20 stub \u63D0\u6848\uFF09\uFF1B",
      "- `sources` \u5199\u7D20\u6750 id\uFF08\u5982 raw/xxx\uFF09\uFF1B\u77DB\u76FE\u4E4B\u5904\u6807 status=contested \u5E76\u5728\u6B63\u6587\u5199\u6E05\u4E24\u8FB9\u8BF4\u6CD5\uFF1B",
      "- \u6700\u540E\u8DD1 wiki_lint\uFF0C\u628A\u65B0\u9875\u7684 error \u6E05\u96F6\u3002",
      "",
      "\u4E0D\u8981\u4FEE\u6539 1-raw \u91CC\u7684\u7D20\u6750\uFF1B\u4E0D\u8981\u5728 2-wiki \u91CC\u76F4\u5199\uFF08\u8D70\u63D0\u6848\uFF09\u3002"
    ].join("\n");
    const accepted = await this.ctx.deferToAgent(instruction, "\u7F16\u8BD1\u7D20\u6750");
    return {
      receipt: { ...emptyReceipt("A07"), notes: [accepted ? "\u5DF2\u4EA4\u7ED9 agent \u6267\u884C" : "\u65E0\u6CD5\u521B\u5EFA\u4EFB\u52A1\uFF0C\u6307\u4EE4\u5DF2\u8FD4\u56DE"] },
      instruction
    };
  }
  // ── A08 缺口补页（交给 agent）──────────────────────────────────
  async gap(input) {
    const { snapshot } = await this.store.load();
    const hits = searchPages(snapshot, input.query, { limit: 6 });
    const instruction = [
      `\u77E5\u8BC6\u5E93\u91CC\u7F3A\u4E00\u4E2A\u80FD\u56DE\u7B54\u300C${input.query}\u300D\u7684\u9875\u3002`,
      `\u73B0\u6709\u6700\u63A5\u8FD1\u7684\u547D\u4E2D\uFF1A${hits.length === 0 ? "\uFF08\u65E0\uFF09" : hits.map((hit) => `\`${hit.id}\` ${hit.title}`).join("\u3001")}`,
      "",
      "\u5148 wiki_read \u8FD9\u4E9B\u9875\uFF0C\u786E\u8BA4\u786E\u5B9E\u7F3A\uFF1B\u518D wiki_write\uFF08mode=propose\uFF09\u5EFA\u4E00\u5F20 stub \u9875\uFF0C",
      "\u5199\u6E05\u300C\u5DF2\u77E5 / \u672A\u77E5 / \u9700\u8981\u4EC0\u4E48\u6765\u6E90\u300D\uFF0C\u5E76\u5728 `## \u5173\u8054` \u91CC\u6302\u5230\u6700\u63A5\u8FD1\u7684\u4E24\u9875\u3002"
    ].join("\n");
    const accepted = await this.ctx.deferToAgent(instruction, "\u8865\u7F3A\u53E3\u9875");
    return {
      receipt: { ...emptyReceipt("A08"), notes: [accepted ? "\u5DF2\u4EA4\u7ED9 agent \u6267\u884C" : "\u65E0\u6CD5\u521B\u5EFA\u4EFB\u52A1\uFF0C\u6307\u4EE4\u5DF2\u8FD4\u56DE"] },
      instruction
    };
  }
  // ── A09 合并提案 ────────────────────────────────────────────────
  async merge(input) {
    const { snapshot, proposals } = await this.store.load();
    const picked = input.all === true ? proposals : proposals.filter((proposal) => (input.paths ?? []).some((name2) => name2 === proposal.path || name2 === basename2(proposal.path)));
    if (picked.length === 0) throw new ActionError("E_NOT_FOUND", "\u6CA1\u6709\u5339\u914D\u7684\u63D0\u6848");
    const steps = [];
    const conflicts = [];
    const schemaErrors = [];
    for (const proposal of picked) {
      const target = proposal.meta.target;
      const segment = target.split("/")[0] ?? "";
      if (!Object.values(PAGE_TYPE_SEGMENT).includes(segment)) {
        schemaErrors.push(`${proposal.path}\uFF1A\u76EE\u6807 id \u76EE\u5F55\u975E\u6CD5\uFF08${target}\uFF09`);
        continue;
      }
      const pageRel = `${WIKI_LAYOUT.wikiDir}/${target}.md`;
      const existing = snapshot.byId.get(target);
      if (proposal.meta.base !== void 0 && existing !== void 0 && existing.updated !== proposal.meta.base) {
        conflicts.push(`${target}\uFF1A\u63D0\u6848\u57FA\u4E8E ${proposal.meta.base}\uFF0C\u5F53\u524D\u662F ${existing.updated}`);
        continue;
      }
      const errors = checkPageBody(proposal.body, target, snapshot, this.store.libraryPath);
      if (errors.length > 0) {
        schemaErrors.push(`${proposal.path}\uFF1A${errors.join("\uFF1B")}`);
        continue;
      }
      steps.push({ proposal, pageRel, body: proposal.body, existed: existing !== void 0 });
    }
    if (schemaErrors.length > 0) throw new ActionError("E_SCHEMA", schemaErrors.join("\n"), { schemaErrors });
    if (conflicts.length > 0) throw new ActionError("E_CONFLICT", conflicts.join("\n"), { conflicts });
    if (input.dryRun === true) {
      return {
        receipt: { ...emptyReceipt("A09"), notes: [`\u5C06\u6539\u52A8 ${steps.length} \u9875`] },
        instruction: steps.map((step) => `${step.existed ? "\u66F4\u65B0" : "\u65B0\u5EFA"} \`${step.proposal.meta.target}\``).join("\n")
      };
    }
    const written = [];
    return this.run("A09", `\u5408\u5E76 ${picked.length} \u4E2A\u63D0\u6848`, async (receipt) => {
      try {
        for (const step of steps) {
          if (step.existed) await this.store.backup(step.pageRel);
          await this.store.write(step.pageRel, step.body);
          written.push(step.pageRel);
          if (step.existed) receipt.changed += 1;
          else receipt.created += 1;
        }
      } catch (error) {
        for (const rel of written) {
          const backup = await this.latestBackupOf(rel);
          if (backup !== void 0) await this.store.write(rel, await this.store.read(backup));
          else await this.store.remove(rel, { hard: true });
        }
        throw error;
      }
      for (const step of steps) {
        await this.store.remove(step.proposal.path);
        receipt.removed += 1;
      }
      const { snapshot: fresh } = await this.store.load();
      await this.store.write(WIKI_LAYOUT.indexPath, renderIndex(fresh, { updated: this.ctx.now() }));
      if (this.ctx.gitEnabled === true && (this.ctx.gitAutoCommit ?? true)) {
        const hash = await commitLibrary(this.store.libraryPath, `merge: ${receipt.removed} proposals`).catch(() => null);
        if (hash !== null) receipt.notes.push(`\u5DF2\u63D0\u4EA4 ${hash}`);
      }
    });
  }
  async latestBackupOf(relPath) {
    const files = await this.store.listAny(WIKI_LAYOUT.backupDir, false);
    const matches = files.filter((file) => basename2(file).includes(relPath.replace(/\//g, "_"))).sort();
    return matches[matches.length - 1];
  }
  // ── A10 提案过期 ────────────────────────────────────────────────
  async expireProposals(input = {}) {
    const keepDays = input.keepDays ?? LIMITS.proposalKeepDays;
    const { proposals } = await this.store.load();
    const now = Date.parse(this.ctx.now());
    const stale = proposals.filter((proposal) => {
      const stamp = proposal.path.match(/(\d{8})-(\d{4})/u);
      if (stamp === null) return false;
      const iso = `${stamp[1].slice(0, 4)}-${stamp[1].slice(4, 6)}-${stamp[1].slice(6, 8)}T${stamp[2].slice(0, 2)}:${stamp[2].slice(2, 4)}:00Z`;
      const at = Date.parse(iso);
      return Number.isNaN(at) ? false : (now - at) / 864e5 > keepDays;
    });
    if (input.dryRun === true) {
      return { receipt: { ...emptyReceipt("A10"), notes: [`${stale.length} \u4E2A\u63D0\u6848\u8D85\u8FC7 ${keepDays} \u5929`] }, instruction: stale.map((item) => item.path).join("\n") };
    }
    return this.run("A10", `\u6E05\u7406\u8FC7\u671F\u63D0\u6848 ${stale.length} \u4E2A`, async (receipt) => {
      for (const proposal of stale) {
        await this.store.remove(proposal.path);
        receipt.removed += 1;
      }
    });
  }
  /**
   * 提案队列的"丢弃"：把提案挪进 `3-review/.trash`。
   * 与 A10 的区别在语义：A10 是"放太久自动过期"，这里是"人看过，不要了"。
   */
  async discardProposals(input = {}) {
    const { proposals } = await this.store.load();
    const picked = input.all === true ? proposals : proposals.filter((proposal) => (input.paths ?? []).includes(proposal.path));
    if (picked.length === 0) throw new ActionError("E_NOT_FOUND", "\u6CA1\u6709\u5339\u914D\u7684\u63D0\u6848");
    return this.run("A09", `\u4E22\u5F03\u63D0\u6848 ${picked.length} \u4E2A`, async (receipt) => {
      for (const proposal of picked) {
        await this.store.remove(proposal.path);
        receipt.removed += 1;
      }
    }, picked.map((proposal) => proposal.path));
  }
  // ── A11 结构体检 ────────────────────────────────────────────────
  async lint(input = {}) {
    const loaded = await this.store.load();
    const findings = lintSnapshot(loaded.snapshot, {
      indexText: loaded.indexText,
      proposalCount: loaded.proposals.length,
      now: this.ctx.now()
    });
    const result = await this.run("A11", `\u4F53\u68C0 ${findings.length} \u9879\uFF08${JSON.stringify(summarize(findings))}\uFF09`, async (receipt) => {
      if (input.fix === true) {
        const fixable = fixableFindings(findings);
        if (fixable.length > 0) {
          await this.store.write(WIKI_LAYOUT.indexPath, renderIndex(loaded.snapshot, { updated: this.ctx.now() }));
          receipt.changed = 1;
          receipt.notes.push(`\u4FEE\u590D ${fixable.length} \u9879\u53EF\u4FEE\u95EE\u9898\uFF08\u91CD\u5EFA\u7D22\u5F15\uFF09`);
        }
      }
    });
    return {
      ...result,
      detail: {
        counts: summarize(findings),
        findings: findings.slice(0, 200).map((item) => ({
          code: item.code,
          severity: item.severity,
          page: item.page,
          message: item.message,
          target: item.target ?? ""
        }))
      }
    };
  }
  // ── A12 去重扫描 ────────────────────────────────────────────────
  async dedupe(input = {}) {
    const { snapshot } = await this.store.load();
    const pairs = dedupe(snapshot, {
      threshold: input.threshold ?? LIMITS.dupThreshold,
      limit: input.limit ?? LIMITS.dupMaxPairs
    });
    if (pairs.length === 0) {
      return { receipt: { ...emptyReceipt("A12"), notes: ["\u6CA1\u6709\u8FBE\u5230\u9608\u503C\u7684\u91CD\u590D\u5019\u9009"] } };
    }
    if (input.dryRun === true) {
      return {
        receipt: { ...emptyReceipt("A12"), notes: [`${pairs.length} \u7EC4\u5019\u9009`] },
        instruction: pairs.map((pair) => `${pair.keep} \u21D4 ${pair.drop}\uFF08${pair.similarity.toFixed(2)}\uFF09`).join("\n")
      };
    }
    const now = this.ctx.now();
    return this.run("A12", `\u53BB\u91CD\u5019\u9009 ${pairs.length} \u7EC4`, async (receipt) => {
      for (const pair of pairs) {
        const keep = snapshot.byId.get(pair.keep);
        const drop = snapshot.byId.get(pair.drop);
        if (keep === void 0 || drop === void 0) continue;
        const merged = mergePages(keep, drop, now);
        await this.store.write(proposalPath(this.store.libraryPath, keep.id, now, "dedupe"), buildProposalText({
          target: keep.id,
          action: "merge",
          pageText: merged,
          now,
          rationale: `\u4E0E ${drop.id} \u76F8\u4F3C\u5EA6 ${pair.similarity.toFixed(2)}\uFF0C\u5EFA\u8BAE\u5408\u5E76\u540E\u5E9F\u6B62\u540E\u8005`,
          baseUpdated: keep.updated
        }));
        await this.store.write(proposalPath(this.store.libraryPath, drop.id, now, "deprecate"), buildProposalText({
          target: drop.id,
          action: "deprecate",
          pageText: deprecatePage(drop, keep.id, now),
          now,
          rationale: `\u5185\u5BB9\u5DF2\u5E76\u5165 ${keep.id}`,
          baseUpdated: drop.updated
        }));
        receipt.created += 2;
      }
    });
  }
  // ── A13 矛盾扫描（交给 agent）──────────────────────────────────
  async contradict(input = {}) {
    const { snapshot } = await this.store.load();
    const pages = snapshot.pages.filter((page) => page.status === "active" && (input.domain === void 0 || page.domain === input.domain)).slice(0, input.maxPages ?? 50);
    if (pages.length < 2) throw new ActionError("E_EMPTY_RAW", "\u53EF\u6BD4\u7684\u9875\u4E0D\u8DB3\u4E24\u9875");
    const instruction = [
      `\u68C0\u67E5 ${pages.length} \u5F20 active \u9875\u4E4B\u95F4\u7684\u4E8B\u5B9E\u6027\u77DB\u76FE\uFF08\u540C\u4E00\u65AD\u8A00\u7ED9\u51FA\u4E0D\u540C\u6570\u503C/\u7ED3\u8BBA/\u56E0\u679C\uFF09\u3002`,
      "\u5019\u9009\u9875\uFF1A",
      ...pages.map((page) => `- \`${page.id}\` ${page.title}`),
      "",
      '\u8BFB\u8FD9\u4E9B\u9875\uFF0C\u53EA\u62A5**\u4E92\u76F8\u51B2\u7A81**\u7684\u65AD\u8A00\u5BF9\uFF1B\u4E0D\u8981\u62A5"\u8868\u8FF0\u4E0D\u540C\u4F46\u610F\u601D\u4E00\u81F4"\u7684\u91CD\u590D\u3002',
      "\u5BF9\u6BCF\u4E00\u5BF9\u51B2\u7A81\uFF1Awiki_write\uFF08mode=propose, action=conflict-resolve\uFF09\u5199\u4E00\u5F20\u88C1\u51B3\u63D0\u6848\uFF0C",
      "\u628A\u53CC\u65B9\u8BF4\u6CD5\u5E76\u5217\u3001\u7ED9\u51FA\u5224\u5B9A\u4E0E\u4F9D\u636E\uFF1B\u65E0\u6CD5\u5224\u5B9A\u7684\u628A\u4E24\u9875\u90FD\u6807 contested \u5E76\u8BF4\u660E\u7F3A\u4EC0\u4E48\u8BC1\u636E\u3002"
    ].join("\n");
    const accepted = await this.ctx.deferToAgent(instruction, "\u77DB\u76FE\u626B\u63CF");
    return {
      receipt: { ...emptyReceipt("A13"), notes: [accepted ? "\u5DF2\u4EA4\u7ED9 agent \u6267\u884C" : "\u65E0\u6CD5\u521B\u5EFA\u4EFB\u52A1\uFF0C\u6307\u4EE4\u5DF2\u8FD4\u56DE"] },
      instruction
    };
  }
  // ── A14 过期页提醒 ──────────────────────────────────────────────
  async stale(input = {}) {
    const { snapshot } = await this.store.load();
    const days = input.days ?? LIMITS.staleDays;
    const now = Date.parse(this.ctx.now());
    const stale = snapshot.pages.filter((page) => {
      if (page.type === "index" || page.type === "log") return false;
      if (page.status !== "active") return false;
      const at = Date.parse(page.updated.length === 10 ? `${page.updated}T00:00:00Z` : page.updated);
      return Number.isNaN(at) ? false : (now - at) / 864e5 > days;
    });
    return {
      receipt: { ...emptyReceipt("A14"), notes: [`${stale.length} \u9875\u8D85\u8FC7 ${days} \u5929\u672A\u66F4\u65B0`] },
      detail: { stale: stale.map((page) => ({ id: page.id, title: page.title, updated: page.updated })) }
    };
  }
  // ── A15 重建索引 ────────────────────────────────────────────────
  async reindex() {
    const { snapshot } = await this.store.load();
    const next = renderIndex(snapshot, { updated: this.ctx.now() });
    const current = await this.store.readOptional(WIKI_LAYOUT.indexPath) ?? "";
    if (current === next) {
      return { receipt: { ...emptyReceipt("A15"), notes: ["\u7D22\u5F15\u5DF2\u662F\u6700\u65B0"] } };
    }
    return this.run("A15", "\u91CD\u5EFA\u7D22\u5F15", async (receipt) => {
      await this.store.write(WIKI_LAYOUT.indexPath, next);
      receipt.changed = 1;
    });
  }
  // ── A16 建库 ────────────────────────────────────────────────────
  async bootstrap() {
    const now = this.ctx.now();
    const { created, skipped } = await this.store.bootstrap(now);
    return {
      receipt: { ...emptyReceipt("A16"), created: created.length, notes: skipped.length > 0 ? [`\u8DF3\u8FC7\u5DF2\u5B58\u5728 ${skipped.length} \u4E2A`] : [] },
      detail: { created, skipped }
    };
  }
  // ── A17 回滚 ────────────────────────────────────────────────────
  /**
   * 回到某个提交的 `2-wiki` / `3-review`。
   * 先给当前状态打一份 `.backup`，所以"回滚错了"本身还能再回滚。
   */
  async rollback(input) {
    if (this.ctx.gitEnabled !== true) {
      throw new ActionError("E_NO_GIT", "git \u56DE\u6EDA\u9ED8\u8BA4\u5173\u95ED\uFF1A\u9700\u8981\u65F6\u628A\u914D\u7F6E gitEnabled \u6253\u5F00\u5E76\u786E\u4FDD\u5E93\u662F\u4E00\u4E2A git \u4ED3\u5E93");
    }
    const repo = await inspectRepo(this.store.libraryPath);
    if (!repo.ok) throw new ActionError(repo.code, repo.message);
    if (input.commit === void 0 || input.commit.trim() === "") {
      throw new ActionError("E_BAD_COMMIT", "\u9700\u8981\u6307\u5B9A\u8981\u56DE\u6EDA\u5230\u7684\u63D0\u4EA4");
    }
    const commit = input.commit.trim();
    const before = await this.store.backupTree(WIKI_LAYOUT.wikiDir);
    if (input.path !== void 0 && input.path.trim() !== "") {
      const rel = input.path.trim().replace(/^\/+/, "");
      if (!rel.startsWith("2-wiki/") && !rel.startsWith("3-review/")) {
        throw new ActionError("E_CONFLICT", "\u53EA\u5141\u8BB8\u56DE\u6EDA 2-wiki / 3-review \u91CC\u7684\u6587\u4EF6");
      }
      await restoreFile(this.store.libraryPath, commit, rel).catch((error) => {
        throw new ActionError("E_BAD_COMMIT", `\u56DE\u6EDA ${rel} \u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      });
      return this.run("A17", `\u56DE\u6EDA\u5355\u9875 ${rel} \u5230 ${commit.slice(0, 8)}`, async (receipt) => {
        receipt.changed = 1;
        if (before !== "") receipt.notes.push(`\u56DE\u6EDA\u524D\u5907\u4EFD\uFF1A${before}`);
      }, [`commit ${commit}`, rel]);
    }
    const restored = await restoreTree(this.store.libraryPath, commit).catch((error) => {
      throw new ActionError("E_BAD_COMMIT", `\u56DE\u6EDA\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
    });
    const extras = restored.extras;
    for (const rel of extras) {
      await this.store.remove(`2-wiki/${rel.replace(/^2-wiki\//, "")}`).catch(() => {
      });
    }
    return this.run("A17", `\u56DE\u6EDA\u5230 ${commit.slice(0, 8)}`, async (receipt) => {
      receipt.changed = restored.restored.length;
      receipt.removed = extras.length;
      if (before !== "") receipt.notes.push(`\u56DE\u6EDA\u524D\u5907\u4EFD\uFF1A${before}`);
    }, [`commit ${commit}`, `\u6062\u590D ${restored.restored.length} \u4E2A\u6587\u4EF6`, extras.length === 0 ? "\u6CA1\u6709\u591A\u4F59\u6587\u4EF6" : `\u79FB\u5165\u56DE\u6536\u7AD9 ${extras.length} \u4E2A: ${extras.join(", ")}`]);
  }
  // ── A18 安全清理 ────────────────────────────────────────────────
  async cleanSafe(input = {}) {
    const targets = [];
    const now = Date.now();
    for (const dir of [WIKI_LAYOUT.wikiDir, WIKI_LAYOUT.rawDir, WIKI_LAYOUT.proposalDir, WIKI_LAYOUT.inboxNotes]) {
      for (const file of await this.store.listAny(dir, false)) {
        if (!/\.tmp-[0-9a-f]{8}$/u.test(file)) continue;
        if (now - await mtimeOf(this.store.abs(file)) > 36e5) targets.push({ rel: file, reason: "\u4E34\u65F6\u6587\u4EF6\u6B8B\u7559" });
      }
    }
    for (const dir of [WIKI_LAYOUT.trashDir, WIKI_LAYOUT.backupDir]) {
      for (const file of await this.store.listAny(dir, true)) {
        if (now - await mtimeOf(this.store.abs(file)) > LIMITS.trashKeepDays * 864e5) {
          targets.push({ rel: file, reason: "\u8D85\u8FC7\u4FDD\u7559\u671F" });
        }
      }
    }
    for (const file of await this.store.listAny(WIKI_LAYOUT.inboxParts, true)) {
      if (/\.(wav|mp3|m4a|mp4|mov|part\d+)$/iu.test(file)) targets.push({ rel: file, reason: "\u5207\u7247\u4E2D\u95F4\u7269" });
    }
    for (const file of await this.store.listAny(WIKI_LAYOUT.backupDir, true)) {
      if (basename2(file).includes("index.md") || basename2(file).includes("log.md")) {
        targets.push({ rel: file, reason: "\u7D22\u5F15\u5907\u4EFD" });
      }
    }
    const unique = targets.filter((target, index) => targets.findIndex((other) => other.rel === target.rel) === index);
    if (input.dryRun === true) {
      return {
        receipt: { ...emptyReceipt("A18"), notes: [`\u5C06\u6E05\u7406 ${unique.length} \u4E2A\u6587\u4EF6`] },
        detail: { targets: unique }
      };
    }
    return this.run("A18", `\u5B89\u5168\u6E05\u7406 ${unique.length} \u4E2A\u6587\u4EF6`, async (receipt) => {
      for (const target of unique) {
        try {
          await this.store.remove(target.rel, { hard: true });
          receipt.removed += 1;
        } catch {
          receipt.notes.push(`\u8DF3\u8FC7 ${target.rel}`);
        }
      }
    }, unique.map((target) => `${target.rel} \u2014 ${target.reason}`));
  }
  // ── A19 深度清理 ────────────────────────────────────────────────
  async cleanDeep(input = {}) {
    const { snapshot } = await this.store.load();
    const referenced = /* @__PURE__ */ new Set();
    for (const page of snapshot.raw.values()) {
      const derived = page.frontmatter.derivedFrom;
      if (typeof derived === "string") referenced.add(derived);
    }
    const orphans = (await this.store.listAny(WIKI_LAYOUT.attachments, false)).filter((file) => !referenced.has(file)).map((file) => ({ rel: file, reason: "\u6CA1\u6709\u7D20\u6750\u9875\u5F15\u7528" }));
    const staleInbox = [];
    const now = Date.now();
    for (const item of await this.inboxItems()) {
      if (now - await mtimeOf(this.store.abs(item.rel)) > 30 * 864e5) {
        staleInbox.push({ rel: item.rel, reason: "30 \u5929\u672A\u786E\u8BA4" });
      }
    }
    const candidates = [...orphans, ...staleInbox];
    if (input.items === void 0 || input.items.length === 0) {
      return {
        receipt: { ...emptyReceipt("A19"), notes: [`${candidates.length} \u9879\u5019\u9009\uFF0C\u9700\u9010\u9879\u52FE\u9009`] },
        detail: { candidates }
      };
    }
    const picked = candidates.filter((candidate) => input.items.includes(candidate.rel));
    if (picked.length === 0) throw new ActionError("E_STALE_PREVIEW", "\u6E05\u5355\u5DF2\u53D8\u5316\uFF1A\u8BF7\u91CD\u65B0\u9884\u89C8\u540E\u518D\u52FE\u9009");
    if (input.dryRun === true) {
      return { receipt: { ...emptyReceipt("A19"), notes: [`\u5C06\u79FB\u5165\u56DE\u6536\u7AD9 ${picked.length} \u9879`] }, detail: { candidates: picked } };
    }
    return this.run("A19", `\u6DF1\u5EA6\u6E05\u7406 ${picked.length} \u9879\uFF08\u8FDB\u56DE\u6536\u7AD9\uFF09`, async (receipt) => {
      for (const candidate of picked) {
        await this.store.remove(candidate.rel);
        receipt.removed += 1;
      }
    }, picked.map((candidate) => `${candidate.rel} \u2014 ${candidate.reason}`));
  }
  /** 面板状态：一次拉全，前端只读。 */
  async state() {
    if (!await this.store.rootExists()) {
      return {
        initialized: false,
        library: { path: this.store.libraryPath, name: "" },
        mode: { git: this.ctx.gitEnabled, audio: "none" },
        counts: { wiki: 0, stub: 0, active: 0, contested: 0, deprecated: 0, raw: 0, inbox: 0, proposals: 0, orphan: 0 },
        health: 0,
        findings: { error: 0, warn: 0, info: 0, items: [] },
        occupancy: { attachments: 0, parts: 0, backup: 0, trash: 0, pages: 0, total: 0 },
        inbox: [],
        proposals: [],
        pages: []
      };
    }
    const loaded = await this.store.load();
    const inbound = loaded.snapshot.inbound;
    const counts = {
      wiki: loaded.snapshot.pages.filter((page) => page.type !== "index" && page.type !== "log").length,
      stub: loaded.snapshot.pages.filter((page) => page.status === "stub").length,
      active: loaded.snapshot.pages.filter((page) => page.status === "active").length,
      contested: loaded.snapshot.pages.filter((page) => page.status === "contested").length,
      deprecated: loaded.snapshot.pages.filter((page) => page.status === "deprecated").length,
      raw: loaded.snapshot.raw.size,
      inbox: (await this.inboxItems()).length,
      proposals: loaded.proposals.length,
      orphan: [...inbound.entries()].filter(([, count]) => count === 0).length
    };
    const findings = lintSnapshot(loaded.snapshot, {
      indexText: loaded.indexText,
      proposalCount: loaded.proposals.length,
      now: this.ctx.now()
    });
    const health = loaded.snapshot.pages.length === 0 ? 100 : Math.max(0, 100 - findings.filter((item) => RULES[item.code].severity === "error").length * 5 - findings.filter((item) => RULES[item.code].severity === "warn").length * 2);
    const occupancy = await this.store.occupancy();
    return {
      initialized: true,
      counts,
      health,
      findings: summarize(findings),
      occupancy,
      inbox: await this.inboxItems(),
      proposals: loaded.proposals.map((proposal) => ({
        path: proposal.path,
        target: proposal.meta.target,
        action: proposal.meta.action,
        reason: proposal.meta.reason ?? "",
        generatedAt: proposal.meta.generatedAt ?? ""
      })),
      pages: loaded.snapshot.pages.filter((page) => page.type !== "index" && page.type !== "log").sort((left, right) => (inbound.get(right.id) ?? 0) - (inbound.get(left.id) ?? 0)).slice(0, 60).map((page) => ({
        id: page.id,
        title: page.title,
        status: page.status,
        domain: page.domain ?? "",
        inbound: inbound.get(page.id) ?? 0,
        updated: page.updated
      }))
    };
  }
};
async function mtimeOf(absolute) {
  const { stat: stat4 } = await import("node:fs/promises");
  try {
    return (await stat4(absolute)).mtimeMs;
  } catch {
    return Date.now();
  }
}
async function extractPdf(absolute) {
  const { execFile: execFile5 } = await import("node:child_process");
  return new Promise((resolve2, reject) => {
    execFile5("pdftotext", ["-layout", "-q", absolute, "-"], { maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve2(stdout);
    });
  });
}
function titleOfHtml(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match === null ? "" : decodeEntities(match[1]).replace(/\s+/g, " ").trim();
}
function textOfHtml(html) {
  return decodeEntities(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
  ).trim();
}
function decodeEntities(text) {
  return text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function mergePages(keep, drop, now) {
  const extra = drop.body.split("\n").filter((line) => line.trim().startsWith("- ") || line.trim().startsWith("* ")).filter((line) => !stripCode(keep.body).includes(line.trim())).slice(0, 20);
  const body = [
    keep.body.trim(),
    "",
    "## \u5408\u5E76\u8865\u5145",
    "",
    `> \u6765\u81EA [[${drop.id}]]\uFF1A\u4EE5\u4E0B\u8981\u70B9\u5728\u5408\u5E76\u524D\u53EA\u5B58\u5728\u4E8E\u88AB\u5408\u5E76\u9875\u3002`,
    "",
    ...extra,
    ""
  ].join("\n");
  return buildPageText({
    id: keep.id,
    type: keep.type,
    title: keep.title,
    summary: keep.summary,
    body: body.replace(/^#\s.*$/m, ""),
    status: keep.status,
    tags: [.../* @__PURE__ */ new Set([...keep.tags, ...drop.tags])],
    aliases: [.../* @__PURE__ */ new Set([...keep.aliases, ...drop.aliases])],
    sources: [.../* @__PURE__ */ new Set([...keep.sources, ...drop.sources])]
  }, { now, existing: { created: keep.created } });
}
function deprecatePage(page, replaces, now) {
  const body = [
    page.body.trim(),
    "",
    "## \u5E9F\u6B62\u8BF4\u660E",
    "",
    `- \u4E3A\u4F55\u5E9F\u6B62\uFF1A\u5185\u5BB9\u4E0E [[${replaces}]] \u91CD\u590D\uFF0C\u5408\u5E76\u540E\u4E0D\u518D\u72EC\u7ACB\u7EF4\u62A4\u3002`,
    `- \u88AB\u8C01\u66FF\u4EE3\uFF1A[[${replaces}]]`,
    `- \u6700\u540E\u6709\u6548\u65E5\u671F\uFF1A${now.slice(0, 10)}`,
    ""
  ].join("\n").replace(/^#\s.*$/m, "");
  return buildPageText({
    id: page.id,
    type: page.type,
    title: page.title,
    summary: page.summary,
    body,
    status: "deprecated",
    tags: page.tags,
    aliases: page.aliases,
    sources: page.sources
  }, { now, existing: { created: page.created } });
}

// host/jobs.ts
var OWNER = "llm-wiki";
var TZ = "Asia/Shanghai";
function dailyAt(time) {
  return { kind: "daily", daily: { time, time_zone: TZ } };
}
function weeklyAt(time, weekdays) {
  return { kind: "weekly", weekly: { time, time_zone: TZ, weekdays } };
}
function escape(text) {
  return typeof text === "string" ? text : JSON.stringify(text);
}
var JOB_DEFINITIONS = [
  {
    id: "J01",
    name: "\u7D22\u5F15\u91CD\u5EFA",
    why: "\u9875\u9762\u53D8\u4E86\u7D22\u5F15\u6CA1\u53D8\uFF0C\u68C0\u7D22\u5C31\u4F1A\u6307\u5411\u65E7\u6458\u8981\u3002",
    kind: "event",
    action: "A15",
    cost: "0",
    defaults: { debounceMs: 1500 },
    optionSpec: [{ key: "debounceMs", label: "\u9632\u6296\uFF08\u6BEB\u79D2\uFF09", type: "number", min: 500, max: 5e3 }],
    promptOf: (options) => `\u7528 wiki_action \u6267\u884C A15\uFF08\u91CD\u5EFA\u7D22\u5F15\uFF09\u3002\u9632\u6296 ${escape(options.debounceMs)} \u6BEB\u79D2\u5185\u7684\u591A\u6B21\u5199\u5165\u5408\u5E76\u4E3A\u4E00\u6B21\u3002`
  },
  {
    id: "J02",
    name: "\u5355\u9875\u4F53\u68C0",
    why: "\u65B0\u9875\u5199\u574F schema \u65F6\uFF0C\u5C31\u5730\u62A5\u9519\u6BD4\u5468\u62A5\u66F4\u65E9\u3002",
    kind: "event",
    action: "A11",
    cost: "0",
    defaults: { blockOnError: true },
    optionSpec: [{ key: "blockOnError", label: "\u6709 error \u65F6\u963B\u6B62\u5408\u5E76", type: "boolean" }],
    promptOf: () => "\u7528 wiki_action \u6267\u884C A11\uFF08scope=page\uFF0Cfix=false\uFF09\uFF0C\u53EA\u68C0\u67E5\u521A\u5199\u5165\u7684\u90A3\u4E00\u9875\u3002"
  },
  {
    id: "J03",
    name: "\u5168\u91CF\u4F53\u68C0",
    why: "\u65AD\u94FE\u3001\u5B64\u513F\u3001\u7F3A\u51FA\u5904\u4F1A\u6162\u6162\u5806\u79EF\uFF0C\u6BCF\u5468\u6E05\u4E00\u6B21\u3002",
    kind: "clock",
    action: "A11",
    cost: "0",
    defaults: { time: "09:00", notify: true },
    optionSpec: [
      { key: "time", label: "\u6BCF\u5929\u51E0\u70B9", type: "string", hint: "HH:mm" },
      { key: "notify", label: "\u6709\u95EE\u9898\u65F6\u901A\u77E5", type: "boolean" }
    ],
    cronOf: (options) => dailyAt(`${escape(options.time)}:00`.replace("::", ":")),
    promptOf: () => "\u7528 wiki_action \u6267\u884C A11\uFF08scope=full\uFF0Cfix=true\uFF09\uFF0C\u628A\u53EF\u4FEE\u7684\u95EE\u9898\u4FEE\u6389\uFF0C\u5176\u4F59\u6309\u4E25\u91CD\u5EA6\u5217\u51FA\u3002"
  },
  {
    id: "J04",
    name: "\u63D0\u6848\u8FC7\u671F",
    why: "\u6CA1\u4EBA\u88C1\u51B3\u7684\u63D0\u6848\u4F1A\u4E00\u76F4\u6302\u5728\u9762\u677F\u4E0A\uFF0C\u63A9\u76D6\u65B0\u63D0\u6848\u3002",
    kind: "clock",
    action: "A10",
    cost: "0",
    defaults: { keepDays: 7, time: "09:10" },
    optionSpec: [
      { key: "keepDays", label: "\u4FDD\u7559\u5929\u6570", type: "number", min: 3, max: 60 },
      { key: "time", label: "\u6BCF\u5929\u51E0\u70B9", type: "string", hint: "HH:mm" }
    ],
    cronOf: (options) => dailyAt(`${escape(options.time)}:00`),
    promptOf: (options) => `\u7528 wiki_action \u6267\u884C A10\uFF0C\u6E05\u7406\u8D85\u8FC7 ${escape(options.keepDays)} \u5929\u7684\u63D0\u6848\u3002`
  },
  {
    id: "J05",
    name: "\u91CD\u590D\u626B\u63CF",
    why: "\u540C\u4E00\u4E2A\u6982\u5FF5\u5199\u4E24\u9875\uFF0C\u68C0\u7D22\u4F1A\u5404\u7ED9\u4E00\u534A\u7B54\u6848\u3002",
    kind: "clock",
    action: "A12",
    cost: "llm",
    defaults: { threshold: 0.75, maxPairs: 20, time: "09:20", weekdays: [1] },
    optionSpec: [
      { key: "threshold", label: "\u76F8\u4F3C\u5EA6\u9608\u503C", type: "number", min: 0.5, max: 0.95 },
      { key: "maxPairs", label: "\u6700\u591A\u5019\u9009\u5BF9", type: "number", min: 5, max: 50 },
      { key: "time", label: "\u51E0\u70B9", type: "string", hint: "HH:mm" }
    ],
    cronOf: (options) => weeklyAt(`${escape(options.time)}:00`, [1]),
    promptOf: (options) => `\u7528 wiki_action \u6267\u884C A12\uFF08threshold=${escape(options.threshold)}\uFF0Climit=${escape(options.maxPairs)}\uFF09\uFF0C\u5BF9\u4EA7\u51FA\u7684\u5408\u5E76\u63D0\u6848\u9010\u6761\u5224\u65AD\u662F\u5426\u771F\u7684\u540C\u4E00\u5B9E\u4F53\uFF1A\u662F\u5219\u4FDD\u7559\u63D0\u6848\uFF0C\u5426\u5219\u7528 wiki_action \u65E0\u6CD5\u5220\u9664\u65F6\u660E\u786E\u8BF4\u660E\u54EA\u6761\u8BEF\u62A5\u3002`
  },
  {
    id: "J06",
    name: "\u77DB\u76FE\u626B\u63CF",
    why: "\u4E24\u9875\u7ED9\u51FA\u4E0D\u540C\u6570\u5B57\u65F6\uFF0C\u8C01\u4E5F\u4E0D\u4F1A\u4E3B\u52A8\u53D1\u73B0\u3002",
    kind: "clock",
    action: "A13",
    cost: "llm",
    defaults: { maxPages: 50, time: "09:30", weekdays: [1] },
    optionSpec: [
      { key: "maxPages", label: "\u6BCF\u6B21\u6700\u591A\u68C0\u67E5\u9875\u6570", type: "number", min: 10, max: 200 },
      { key: "time", label: "\u51E0\u70B9", type: "string", hint: "HH:mm" }
    ],
    cronOf: (options) => weeklyAt(`${escape(options.time)}:00`, [1]),
    promptOf: (options) => `\u7528 wiki_action \u6267\u884C A13\uFF08maxPages=${escape(options.maxPages)}\uFF09\uFF0C\u53EA\u62A5\u4E8B\u5B9E\u6027\u51B2\u7A81\uFF0C\u4E0D\u62A5\u63AA\u8F9E\u5DEE\u5F02\u3002`
  },
  {
    id: "J07",
    name: "\u8FC7\u671F\u9875\u63D0\u9192",
    why: "active \u4F46\u534A\u5E74\u6CA1\u66F4\u65B0\u7684\u9875\uFF0C\u5F80\u5F80\u5DF2\u7ECF\u4E0D\u53EF\u4FE1\u3002",
    kind: "clock",
    action: "A14",
    cost: "0",
    defaults: { staleDays: 180, time: "09:40" },
    optionSpec: [
      { key: "staleDays", label: "\u591A\u4E45\u7B97\u8FC7\u671F\uFF08\u5929\uFF09", type: "number", min: 30, max: 730 },
      { key: "time", label: "\u51E0\u70B9", type: "string", hint: "HH:mm" }
    ],
    cronOf: (options) => dailyAt(`${escape(options.time)}:00`),
    promptOf: (options) => `\u7528 wiki_action \u6267\u884C A14\uFF08days=${escape(options.staleDays)}\uFF09\uFF0C\u628A\u8FC7\u671F\u9875\u5217\u8868\u7ED9\u6211\uFF0C\u4E0D\u8981\u81EA\u52A8\u6539\u9875\u3002`
  },
  {
    id: "J08",
    name: "\u4E3B\u9898\u91C7\u96C6",
    why: "\u77E5\u8BC6\u5E93\u8981\u957F\uFF0C\u5F97\u6709\u4EBA\u6301\u7EED\u5F80\u91CC\u9001\u6599\u3002",
    kind: "clock",
    action: "A04",
    cost: "llm",
    defaults: { topic: "", sources: [], maxItems: 5, time: "08:30" },
    optionSpec: [
      { key: "topic", label: "\u91C7\u96C6\u4E3B\u9898", type: "string" },
      { key: "maxItems", label: "\u6BCF\u6B21\u6761\u6570", type: "number", min: 1, max: 20 },
      { key: "time", label: "\u6BCF\u5929\u51E0\u70B9", type: "string", hint: "HH:mm" },
      { key: "sources", label: "\u91C7\u96C6\u6E90\uFF08\u9017\u53F7\u5206\u9694 URL\uFF09", type: "string" }
    ],
    cronOf: (options) => dailyAt(`${escape(options.time)}:00`),
    promptOf: (options) => [
      `\u91C7\u96C6\u4E3B\u9898\u300C${escape(options.topic)}\u300D\uFF0C\u6700\u591A ${escape(options.maxItems)} \u6761\u3002`,
      `\u91C7\u96C6\u6E90\uFF1A${escape(options.sources)}`,
      "\u7528 wiki_action \u6267\u884C A04\uFF0C\u628A\u6293\u5230\u7684\u5185\u5BB9\u843D\u8FDB 0-inbox/collect\uFF0C\u4E0D\u8981\u76F4\u63A5\u5199 wiki\u3002"
    ].join("\n")
  },
  {
    id: "J09",
    name: "\u7F3A\u53E3\u8865\u9875",
    why: "\u68C0\u7D22\u8FDE\u7EED\u6253\u7A7A\uFF0C\u8BF4\u660E\u5E93\u91CC\u7F3A\u8FD9\u4E00\u5757\u3002",
    kind: "event",
    action: "A08",
    cost: "llm",
    defaults: { missThreshold: 3 },
    optionSpec: [{ key: "missThreshold", label: "\u8FDE\u7EED\u6253\u7A7A\u51E0\u6B21\u89E6\u53D1", type: "number", min: 2, max: 10 }],
    promptOf: () => "\u540C\u4E00\u4E3B\u9898\u8FDE\u7EED\u68C0\u7D22\u6253\u7A7A\u65F6\uFF0C\u7528 wiki_action \u6267\u884C A08 \u5EFA stub \u9875\uFF0C\u5199\u6E05\u5DF2\u77E5/\u672A\u77E5/\u9700\u8981\u4EC0\u4E48\u6765\u6E90\u3002"
  },
  {
    id: "J10",
    name: "\u5783\u573E\u6E05\u7406",
    why: "\u4E34\u65F6\u6587\u4EF6\u3001\u5207\u7247\u3001\u8FC7\u671F\u5907\u4EFD\u4F1A\u4E00\u76F4\u5360\u5730\u65B9\u3002",
    kind: "clock",
    action: "A18",
    cost: "0",
    defaults: { level: "safe", time: "09:50", weekdays: [7] },
    optionSpec: [
      { key: "level", label: "\u7EA7\u522B\uFF08safe / safe+deep-list\uFF09", type: "string" },
      { key: "time", label: "\u51E0\u70B9", type: "string", hint: "HH:mm" }
    ],
    cronOf: (options) => weeklyAt(`${escape(options.time)}:00`, [7]),
    promptOf: (options) => `\u7528 wiki_action \u6267\u884C A18\uFF08dryRun=false\uFF09\u3002\u7EA7\u522B ${escape(options.level)}\uFF1Asafe \u76F4\u63A5\u6E05\uFF1B\u9700\u8981\u6DF1\u5EA6\u6E05\u7406\u65F6\u6267\u884C A19 \u53EA\u51FA\u6E05\u5355\uFF0C\u7B49\u6211\u52FE\u9009\u3002`
  }
];
function defaultJobsFile(library) {
  const jobs = {};
  for (const definition of JOB_DEFINITIONS) {
    jobs[definition.id] = { enabled: false, taskId: null, options: { ...definition.defaults } };
  }
  return { version: 1, library, jobs };
}
function isOwned(entry, library) {
  return entry.title.startsWith("[wiki] ") && entry.prompt.split("\n")[0] === `owner: ${OWNER}; library: ${library}`;
}
function titleOf(definition, libraryName) {
  return `[wiki] ${libraryName} \xB7 ${definition.name}`;
}
function promptOf(definition, library, options) {
  return [`owner: ${OWNER}; library: ${library}`, definition.promptOf(options, library)].join("\n");
}
var JobsStore = class {
  constructor(store, libraryName) {
    this.store = store;
    this.currentName = libraryName;
  }
  currentName;
  /** 切库时同步改名：任务标题与 prompt 里的库名跟着走。 */
  rename(libraryName) {
    this.currentName = libraryName;
  }
  async load() {
    const raw = await this.store.readOptional(WIKI_LAYOUT.jobsFile);
    if (raw === void 0 || raw.trim() === "") return defaultJobsFile(this.store.libraryPath);
    try {
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || typeof parsed.jobs !== "object") return defaultJobsFile(this.store.libraryPath);
      const merged = defaultJobsFile(this.store.libraryPath);
      for (const [id, definition] of Object.entries(merged.jobs)) {
        const stored = parsed.jobs[id];
        if (stored !== void 0) {
          definition.enabled = stored.enabled === true;
          definition.taskId = typeof stored.taskId === "string" ? stored.taskId : null;
          definition.options = { ...definition.options, ...stored.options ?? {} };
        }
      }
      return { version: 1, library: this.store.libraryPath, jobs: merged.jobs };
    } catch {
      return defaultJobsFile(this.store.libraryPath);
    }
  }
  async save(file) {
    await this.store.write(WIKI_LAYOUT.jobsFile, `${JSON.stringify(file, null, 2)}
`);
  }
  get name() {
    return this.currentName;
  }
};
async function reconcile(schedule, file, library, libraryName, definitions = JOB_DEFINITIONS) {
  const result = { created: [], deleted: [], disabled: [], changed: false };
  let entries;
  try {
    entries = await schedule.catalog();
  } catch {
    return result;
  }
  const owned = new Set(Object.values(file.jobs).map((state) => state.taskId).filter((id) => id !== null));
  for (const definition of definitions) {
    if (definition.kind === "event") continue;
    const state = file.jobs[definition.id];
    if (state === void 0) continue;
    const matched = state.taskId === null ? void 0 : entries.find((entry) => entry.id === state.taskId);
    if (state.enabled && matched === void 0) {
      const timing = definition.cronOf?.(state.options, TZ) ?? null;
      if (timing === null) continue;
      const created = await schedule.create({
        title: titleOf(definition, libraryName),
        prompt: promptOf(definition, library, state.options),
        timing,
        target: { kind: "new_once" }
      });
      state.taskId = created.id;
      result.created.push(definition.id);
      result.changed = true;
      continue;
    }
    if (!state.enabled && matched !== void 0 && owned.has(matched.id)) {
      await schedule.edit({ id: matched.id, action: "delete" });
      state.taskId = null;
      result.deleted.push(definition.id);
      result.changed = true;
      continue;
    }
    if (state.enabled && state.taskId !== null && matched === void 0) {
      state.enabled = false;
      state.taskId = null;
      result.disabled.push(definition.id);
      result.changed = true;
    }
  }
  return result;
}
async function taskBoard(schedule, file, library) {
  let entries = [];
  try {
    entries = await schedule.catalog();
  } catch {
    entries = [];
  }
  const builtin = JOB_DEFINITIONS.map((definition) => {
    const state = file.jobs[definition.id];
    const entry = state?.taskId === null || state?.taskId === void 0 ? void 0 : entries.find((candidate) => candidate.id === state.taskId);
    return {
      id: definition.id,
      name: definition.name,
      why: definition.why,
      kind: definition.kind,
      action: definition.action,
      cost: definition.cost,
      options: state?.options ?? definition.defaults,
      optionSpec: definition.optionSpec,
      enabled: state?.enabled === true,
      taskId: state?.taskId ?? null,
      status: entry?.status ?? "absent"
    };
  });
  const names = new Set(JOB_DEFINITIONS.map((definition) => definition.name));
  const custom = entries.filter((entry) => ![...names].some((name2) => entry.title.includes(name2)) && isOwned(entry, library)).map((entry) => ({ id: entry.id, title: entry.title, status: entry.status }));
  const suspects = entries.filter((entry) => entry.title.startsWith("[wiki] ") && !isOwned(entry, library) && !custom.some((item) => item.id === entry.id)).map((entry) => ({ id: entry.id, title: entry.title, status: entry.status }));
  return { builtin, custom, suspects };
}

// host/rpc.ts
var TZ2 = "Asia/Shanghai";
function sendJson(res, status, payload) {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}
function readBody(req, cap = 64 * 1024 * 1024) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > cap) {
        reject(new ActionError("E_TOO_LARGE", "\u8BF7\u6C42\u4F53\u8D85\u8FC7\u4E0A\u9650"));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      resolve2(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}
async function readJsonBody(req) {
  const raw = await readBody(req);
  if (raw.length === 0) return {};
  return JSON.parse(raw.toString("utf8"));
}
function headerOf(req, name2) {
  const value = req.headers[name2.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
function failureStatus(error) {
  if (error instanceof ActionError) {
    return { status: 400, body: { ok: false, error: { code: error.code, message: error.message, details: error.details ?? {} } } };
  }
  const message = error instanceof Error ? error.message : String(error);
  const code = /拒绝写入|拒绝访问/u.test(message) ? "E_PATH_OUTSIDE" : /超过上限/u.test(message) ? "E_TOO_LARGE" : "E_INTERNAL";
  return { status: 500, body: { ok: false, error: { code, message, details: {} } } };
}
var EDITABLE_CONFIG_KEYS = [
  "spacePath",
  "libraryPath",
  "libraryName",
  "writeMode",
  "maxCandidates",
  "gitEnabled",
  "gitAutoCommit",
  "audioProvider",
  "audioMaxMinutes",
  "audioChunkMinutes",
  "debounceMs",
  "watchLibrary",
  "vaultName"
];
var NUMBER_LIMITS = {
  maxCandidates: { min: 1, max: 20, step: 1 },
  audioMaxMinutes: { min: 5, max: 120, step: 1 },
  audioChunkMinutes: { min: 2, max: 30, step: 1 },
  debounceMs: { min: 500, max: 5e3, step: 100 }
};
var ENUMS = {
  writeMode: ["propose", "direct"],
  audioProvider: ["none", "whisper", "api"]
};
var BOOLEANS = ["gitEnabled", "gitAutoCommit", "watchLibrary"];
var PATH_KEYS = ["spacePath", "libraryPath"];
function absolutePath(value, key) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed.split(/[\\/]+/u).includes("..")) {
    throw new ActionError("E_SCHEMA", `${key} \u91CC\u4E0D\u80FD\u6709 ..\uFF1A${trimmed}`);
  }
  const absolute = trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(trimmed) || trimmed.startsWith("~");
  if (!absolute) throw new ActionError("E_SCHEMA", `${key} \u8981\u5199\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u4F8B\u5982 /Users/you/obsidian-workspace`);
  return trimmed;
}
function sanitizeConfigPatch(raw) {
  const clean = {};
  for (const key of EDITABLE_CONFIG_KEYS) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (value === void 0) continue;
    if (key in ENUMS) {
      if (typeof value !== "string" || !ENUMS[key].includes(value)) {
        throw new ActionError("E_SCHEMA", `${key} \u53EA\u80FD\u662F ${ENUMS[key].join(" / ")}`);
      }
      clean[key] = value;
      continue;
    }
    if (key in NUMBER_LIMITS) {
      const limit = NUMBER_LIMITS[key];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ActionError("E_SCHEMA", `${key} \u5FC5\u987B\u662F\u6570\u5B57`);
      }
      if (value < limit.min || value > limit.max) {
        throw new ActionError("E_SCHEMA", `${key} \u5FC5\u987B\u5728 ${limit.min}\u2013${limit.max} \u4E4B\u95F4`);
      }
      clean[key] = Math.round(value);
      continue;
    }
    if (PATH_KEYS.includes(key)) {
      if (typeof value !== "string") throw new ActionError("E_SCHEMA", `${key} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u8DEF\u5F84`);
      clean[key] = absolutePath(value, key);
      continue;
    }
    if (BOOLEANS.includes(key)) {
      if (typeof value !== "boolean") throw new ActionError("E_SCHEMA", `${key} \u5FC5\u987B\u662F true \u6216 false`);
      clean[key] = value;
      continue;
    }
    if (typeof value === "string") {
      clean[key] = value.trim();
      continue;
    }
    throw new ActionError("E_SCHEMA", `${key} \u7684\u7C7B\u578B\u4E0D\u5BF9`);
  }
  return clean;
}
function registerRpc(host, deps) {
  const PREFIX = "/api/llm-wiki";
  let disposed = false;
  const handle = async (req, res) => {
    if (disposed) {
      sendJson(res, 503, { ok: false, error: { code: "E_DISPOSED", message: "\u63D2\u4EF6\u5DF2\u5378\u8F7D" } });
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) || "/" : url.pathname;
    const method = (req.method ?? "GET").toUpperCase();
    try {
      if (pathname === "/state" && method === "GET") {
        sendJson(res, 200, await stateOf(deps));
        return;
      }
      if (pathname === "/config" && method === "GET") {
        sendJson(res, 200, { ok: true, config: deps.readConfig(), configPath: deps.configPath ?? "", settingsPath: deps.settingsPath ?? "" });
        return;
      }
      if (pathname === "/config" && method === "POST") {
        let payload;
        try {
          payload = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: { code: "E_BAD_JSON", message: "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON", details: {} } });
          return;
        }
        const raw = payload.config;
        if (raw === null || typeof raw !== "object") {
          sendJson(res, 400, { ok: false, error: { code: "E_BAD_JSON", message: "\u7F3A\u5C11 config \u5BF9\u8C61", details: {} } });
          return;
        }
        const outcome = await deps.writeConfig(sanitizeConfigPatch(raw));
        sendJson(res, 200, {
          ok: true,
          ...outcome,
          config: deps.readConfig(),
          configPath: deps.configPath ?? "",
          settingsPath: deps.settingsPath ?? ""
        });
        return;
      }
      if (pathname === "/action" && method === "POST") {
        let payload;
        try {
          payload = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: { code: "E_BAD_JSON", message: "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON", details: {} } });
          return;
        }
        const action = String(payload.action ?? "").trim();
        if (action === "") {
          sendJson(res, 400, { ok: false, error: { code: "E_ACTION_UNKNOWN", message: "\u7F3A\u5C11 action", details: {} } });
          return;
        }
        const params = payload.params ?? {};
        sendJson(res, 200, { ok: true, ...await dispatch(deps, action, params) });
        return;
      }
      if (pathname === "/upload" && method === "POST") {
        const body = await readBody(req);
        const filename = decodeURIComponent(headerOf(req, "x-filename")) || "upload.bin";
        const mime = headerOf(req, "x-mime") || headerOf(req, "content-type") || "";
        const result = await deps.actions.ingestFile({
          bytes: new Uint8Array(body),
          filename,
          mime,
          domain: headerOf(req, "x-domain") || void 0
        });
        sendJson(res, 200, { ok: true, ...result });
        return;
      }
      if (pathname === "/open" && method === "POST") {
        let payload;
        try {
          payload = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: { code: "E_BAD_JSON", message: "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON", details: {} } });
          return;
        }
        const relPath = String(payload.path ?? "").trim();
        if (relPath !== "" && (relPath.includes("..") || relPath.startsWith("/"))) {
          sendJson(res, 400, { ok: false, error: { code: "E_PATH_OUTSIDE", message: `\u4E0D\u662F\u5E93\u5185\u8DEF\u5F84\uFF1A${relPath}`, details: {} } });
          return;
        }
        const outcome = await deps.openInObsidian(relPath);
        sendJson(res, outcome.ok ? 200 : 502, outcome);
        return;
      }
      if (pathname === "/libraries" && method === "GET") {
        const libraries = await deps.space.list();
        sendJson(res, 200, { ok: true, space: deps.space.path, active: deps.space.active, libraries });
        return;
      }
      if (pathname === "/library" && method === "POST") {
        let payload;
        try {
          payload = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: { code: "E_BAD_JSON", message: "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON", details: {} } });
          return;
        }
        const name2 = String(payload.name ?? "").trim();
        if (name2 === "") {
          sendJson(res, 400, { ok: false, error: { code: "E_BAD_NAME", message: "\u7F3A\u5C11\u5E93\u540D", details: {} } });
          return;
        }
        if (name2.includes("/") || name2.includes("\\") || name2.startsWith(".") || name2 === "..") {
          sendJson(res, 400, {
            ok: false,
            error: { code: "E_BAD_NAME", message: `\u5E93\u540D\u4E0D\u80FD\u5E26 / \u6216 \\\uFF0C\u4E5F\u4E0D\u80FD\u4EE5\u70B9\u5F00\u5934\uFF1A${name2}`, details: {} }
          });
          return;
        }
        if (payload.op === "switch") {
          const target = await deps.space.activate(name2);
          deps.space.active = target.name;
          sendJson(res, 200, { ok: true, op: "switch", library: target, active: target.name });
          return;
        }
        if (payload.op === "init" || payload.op === "create") {
          const libraries = await deps.space.list().catch(() => []);
          const existing = libraries.find((item) => item.name === name2);
          if (existing?.initialized === true) {
            sendJson(res, 400, {
              ok: false,
              error: { code: "E_EXISTS", message: `\u7A7A\u95F4\u91CC\u5DF2\u7ECF\u6709\u5E93 ${name2}\uFF1A\u5207\u8FC7\u53BB\u5C31\u884C\uFF0C\u4E0D\u5FC5\u91CD\u5EFA`, details: {} }
            });
            return;
          }
          const created = await deps.space.init(name2);
          const target = await deps.space.activate(created.name);
          deps.space.active = target.name;
          sendJson(res, 200, { ok: true, op: "init", library: target, active: target.name });
          return;
        }
        sendJson(res, 400, { ok: false, error: { code: "E_BAD_OP", message: `\u672A\u77E5\u7684\u5E93\u64CD\u4F5C\uFF1A${String(payload.op ?? "")}`, details: {} } });
        return;
      }
      sendJson(res, 404, { ok: false, error: { code: "E_NO_ROUTE", message: `\u672A\u77E5\u8DEF\u7531 ${method} ${pathname}`, details: {} } });
    } catch (error) {
      const { status, body } = failureStatus(error);
      sendJson(res, status, body);
    }
  };
  const dispose = host.webServer.register({ kind: "prefix", path: PREFIX, handler: handle });
  return () => {
    disposed = true;
    dispose();
  };
}
async function stateOf(deps) {
  const base = await deps.actions.state();
  const schedule = deps.schedule();
  const jobs = await deps.jobs.load();
  const board = schedule === void 0 ? { builtin: [], custom: [], suspects: [] } : await taskBoard(schedule, jobs, deps.store.libraryPath);
  const libraries = deps.space.path === "" ? [] : await deps.space.list().catch(() => []);
  const commits = deps.gitEnabled ? await recentCommits(deps.store.libraryPath, 5).catch(() => []) : [];
  return {
    ok: true,
    ...base,
    library: { path: deps.store.libraryPath, name: deps.libraryName },
    space: { path: deps.space.path, active: deps.libraryName, libraries },
    mode: { git: deps.gitEnabled, audio: deps.audioProvider },
    git: { enabled: deps.gitEnabled, commits },
    scheduleAvailable: schedule !== void 0,
    obsidian: {
      vault: deps.vaultName,
      cli: await deps.obsidianCli() !== void 0,
      app: deps.obsidianAppAvailable?.() ?? false
    },
    tasks: board
  };
}
function clockTimeOf(raw, fallback = "09:00") {
  const text = String(raw ?? fallback).trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u.exec(text);
  if (match === null) throw new ActionError("E_BAD_TIME", `\u65F6\u95F4\u8981\u5199\u6210 HH:mm\uFF0C\u4F8B\u5982 07:30\uFF1A${text}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) throw new ActionError("E_BAD_TIME", `\u65F6\u95F4\u8D8A\u754C\uFF1A${text}`);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
}
function weekdaysOf(raw) {
  const list = Array.isArray(raw) ? raw : raw === void 0 || raw === null || raw === "" ? [] : [raw];
  const days = [];
  for (const entry of list) {
    const value = Number(entry);
    if (!Number.isInteger(value) || value < 1 || value > 7) {
      throw new ActionError("E_BAD_WEEKDAY", `\u661F\u671F\u53EA\u80FD\u662F 1\u20137\uFF081=\u5468\u4E00\uFF09\uFF1A${String(entry)}`);
    }
    if (!days.includes(value)) days.push(value);
  }
  if (days.length === 0) throw new ActionError("E_BAD_WEEKDAY", "\u6BCF\u5468\u4EFB\u52A1\u81F3\u5C11\u8981\u9009\u4E00\u5929");
  return days.sort((left, right) => left - right);
}
function localStamp(time) {
  const now = /* @__PURE__ */ new Date();
  const [hour = "09", minute = "00", second = "00"] = time.split(":");
  const pad = (value) => String(value).padStart(2, "0");
  return [
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    `T${hour}${minute}${second}`
  ].join("");
}
function intervalRule(days, time) {
  const span = Math.max(2, Math.min(30, Math.round(days)));
  return `DTSTART;TZID=${TZ2}:${localStamp(time)}
RRULE:FREQ=DAILY;INTERVAL=${span}`;
}
function monthlyRule(monthDay, time) {
  const day = monthDay === -1 ? -1 : Math.round(monthDay);
  if (day !== -1 && (!Number.isInteger(day) || day < 1 || day > 31)) {
    throw new ActionError("E_BAD_MONTHDAY", '\u6BCF\u6708\u51E0\u53F7\u8981\u5728 1\u201331 \u4E4B\u95F4\uFF0C\u6216\u8005\u9009"\u6700\u540E\u4E00\u5929"');
  }
  return `DTSTART;TZID=${TZ2}:${localStamp(time)}
RRULE:FREQ=MONTHLY;BYMONTHDAY=${day}`;
}
function createTiming(params) {
  const frequency = String(params.frequency ?? "daily").trim();
  const time = clockTimeOf(params.time);
  switch (frequency) {
    case "weekly":
      return { kind: "weekly", weekly: { time, time_zone: TZ2, weekdays: weekdaysOf(params.weekdays ?? params.weekday) } };
    case "monthly": {
      const raw = params.monthDay ?? params.day ?? 1;
      const day = Number(raw);
      if (!Number.isFinite(day)) throw new ActionError("E_BAD_MONTHDAY", "\u6BCF\u6708\u51E0\u53F7\u5FC5\u987B\u662F\u6570\u5B57\uFF0C\u6216\u7528 -1 \u8868\u793A\u6700\u540E\u4E00\u5929");
      return { kind: "rrule", rrule: monthlyRule(day, time) };
    }
    case "interval": {
      const days = Number(params.everyDays ?? params.days ?? 3);
      if (!Number.isFinite(days) || days < 2 || days > 30) {
        throw new ActionError("E_BAD_INTERVAL", "\u95F4\u9694\u5929\u6570\u8981\u5728 2\u201330 \u4E4B\u95F4");
      }
      return { kind: "rrule", rrule: intervalRule(days, time) };
    }
    case "rrule": {
      const rawRule = String(params.rrule ?? "").trim();
      if (!rawRule.includes("DTSTART") || !rawRule.includes("RRULE")) {
        throw new ActionError("E_BAD_RULE", "rrule \u9700\u8981 DTSTART \u4E0E RRULE \u4E24\u884C");
      }
      return { kind: "rrule", rrule: rawRule };
    }
    default:
      return { kind: "daily", daily: { time, time_zone: TZ2 } };
  }
}
async function dispatch(deps, action, params) {
  const actions = deps.actions;
  switch (action) {
    case "A01":
      return actions.note({ text: String(params.text ?? ""), title: params.title, domain: params.domain });
    case "A03":
      return actions.preprocess({ item: String(params.item ?? "") });
    case "A04":
      return actions.collect({
        urls: Array.isArray(params.urls) ? params.urls.map(String) : String(params.sources ?? "").split(",").filter((url) => url.trim() !== ""),
        topic: params.topic,
        domain: params.domain,
        maxItems: typeof params.maxItems === "number" ? params.maxItems : void 0
      });
    case "A05":
      return actions.confirm({ items: params.items, all: params.all === true, byHuman: true });
    case "A06":
      return actions.retract({ item: String(params.item ?? "") });
    case "A07":
      return actions.compile({ items: params.items, all: params.all === true });
    case "A08":
      return actions.gap({ query: String(params.query ?? "") });
    case "A09":
      return actions.merge({ paths: params.paths, all: params.all === true, dryRun: params.dryRun === true });
    case "A10":
      return actions.expireProposals({ keepDays: typeof params.keepDays === "number" ? params.keepDays : void 0, dryRun: params.dryRun === true });
    case "A11":
      return actions.lint({ fix: params.fix === true });
    case "A12":
      return actions.dedupe({
        threshold: typeof params.threshold === "number" ? params.threshold : void 0,
        limit: typeof params.limit === "number" ? params.limit : void 0,
        dryRun: params.dryRun === true
      });
    case "A13":
      return actions.contradict({
        domain: params.domain,
        maxPages: typeof params.maxPages === "number" ? params.maxPages : void 0
      });
    case "A14":
      return actions.stale({ days: typeof params.days === "number" ? params.days : void 0 });
    case "A15":
      return actions.reindex();
    case "A16":
      return actions.bootstrap();
    case "A17":
      return actions.rollback({ commit: params.commit, path: params.path });
    case "A18":
      return actions.cleanSafe({ dryRun: params.dryRun === true });
    case "A19":
      return actions.cleanDeep({ items: params.items, dryRun: params.dryRun === true });
    case "P.discard":
      return actions.discardProposals({
        paths: Array.isArray(params.paths) ? params.paths.map(String) : void 0,
        all: params.all === true
      });
    case "J.create": {
      const schedule = deps.schedule();
      if (schedule === void 0) throw new ActionError("E_NO_SCHEDULE", "DSH \u5B9A\u65F6\u4EFB\u52A1\u670D\u52A1\u4E0D\u53EF\u7528");
      const label = String(params.title ?? "").trim();
      if (label === "") throw new ActionError("E_BAD_NAME", "\u65B0\u4EFB\u52A1\u9700\u8981\u4E00\u4E2A\u540D\u5B57");
      const timing = createTiming(params);
      const created = await schedule.create({
        title: `[wiki] ${deps.libraryName} \xB7 ${label}`,
        prompt: [
          `owner: llm-wiki; library: ${deps.store.libraryPath}`,
          String(params.prompt ?? label)
        ].join("\n"),
        timing,
        target: { kind: "new_once" }
      });
      return {
        receipt: { action: "J.create", changed: 1, created: 1, removed: 0, ms: 0, notes: [created.id] },
        detail: { id: created.id, timing }
      };
    }
    /**
     * 一句话建任务：把自然语言交给 agent，由它翻译成 rrule + 指令，
     * 再用 schedule_create 建。表单装不下的规则（每月第一个工作日、隔两天、
     * 月底最后一天）走这条路；常规规则仍走上面的表单，0 token。
     */
    case "J.plan": {
      const text = String(params.text ?? "").trim();
      if (text === "") throw new ActionError("E_BAD_NAME", "\u5148\u7528\u4E00\u53E5\u8BDD\u8BF4\u6E05\u8981\u5B9A\u4EC0\u4E48\u4E8B");
      if (deps.deferToAgent === void 0) throw new ActionError("E_NO_AGENT", "\u8FD9\u6761\u901A\u9053\u9700\u8981 agent\uFF1A\u8BF7\u5728\u4F1A\u8BDD\u91CC\u8BA9\u6211\u6765\u5EFA");
      const instruction = [
        `\u7528\u6237\u60F3\u6309\u81EA\u7136\u8BED\u8A00\u5EFA\u4E00\u6761\u5B9A\u65F6\u4EFB\u52A1\uFF0C\u539F\u8BDD\uFF1A\u300C${text}\u300D`,
        "",
        "\u8BF7\u7528 schedule_create \u5EFA\u8FD9\u6761\u4EFB\u52A1\uFF0C\u4E09\u4EF6\u4E8B\u522B\u6539\uFF1A",
        `1) title \u5FC5\u987B\u5199\u6210 \`[wiki] ${deps.libraryName} \xB7 <\u4F60\u6982\u62EC\u7684\u52A8\u4F5C>\`\uFF0C\u524D\u7F00\u662F\u63D2\u4EF6\u8BA4\u9886\u4EFB\u52A1\u7684\u4F9D\u636E\uFF1B`,
        `2) prompt \u7B2C\u4E00\u884C\u5199 \`owner: llm-wiki; library: ${deps.store.libraryPath}\`\uFF0C\u4E4B\u540E\u5199\u6BCF\u6B21\u8981\u6267\u884C\u7684\u5177\u4F53\u52A8\u4F5C\uFF1B`,
        `3) rrule \u7528\u4E24\u884C\u8868\u8FBE\u65F6\u95F4\uFF1A\`DTSTART;TZID=${TZ2}:YYYYMMDDTHHMMSS\` + \`RRULE:FREQ=...\`\uFF0C`,
        "   \u4F8B\u5982\u6BCF\u5468\u4E00\u4E09\u4E94 07:30 \u2192 FREQ=WEEKLY;BYDAY=MO,WE,FR\uFF1B\u9694\u4E24\u5929 \u2192 FREQ=DAILY;INTERVAL=2\uFF1B",
        "   \u6BCF\u6708\u7B2C\u4E00\u4E2A\u5DE5\u4F5C\u65E5 \u2192 FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1\u3002",
        "target \u7528 new_once\u3002\u5EFA\u5B8C\u56DE\u4E00\u53E5\uFF1A\u4EFB\u52A1\u540D + \u4F60\u7406\u89E3\u7684\u65F6\u95F4\uFF08\u7528\u4E2D\u6587\u8BF4\u4EBA\u8BDD\uFF09\u3002"
      ].join("\n");
      const handed = await deps.deferToAgent(instruction, "\u6309\u4E00\u53E5\u8BDD\u6392\u4E00\u6761\u4EFB\u52A1");
      return {
        receipt: { action: "J.plan", changed: handed ? 1 : 0, created: 0, removed: 0, ms: 0, notes: handed ? ["\u5DF2\u4EA4\u7ED9 agent"] : [] },
        instruction: handed ? void 0 : instruction
      };
    }
    case "J.delete": {
      const schedule = deps.schedule();
      const jobId = String(params.jobId ?? "");
      const taskId = String(params.taskId ?? "");
      const file = await deps.jobs.load();
      let removed = 0;
      if (jobId !== "") {
        const state = file.jobs[jobId];
        if (state === void 0) throw new ActionError("E_NOT_FOUND", `\u6CA1\u6709\u4EFB\u52A1 ${jobId}`);
        if (state.taskId !== null && schedule !== void 0) {
          await schedule.edit({ id: state.taskId, action: "delete" });
          removed += 1;
        }
        state.enabled = false;
        state.taskId = null;
        await deps.jobs.save(file);
        return { receipt: { action: "J.delete", changed: 1, created: 0, removed, ms: 0, notes: ["\u5185\u7F6E\u4EFB\u52A1\u53EA\u662F\u505C\u7528\u5E76\u4ECE DSH \u5220\u9664\uFF0C\u5B9A\u4E49\u4FDD\u7559"] } };
      }
      if (taskId === "") throw new ActionError("E_BAD_NAME", "\u7F3A\u5C11 jobId \u6216 taskId");
      if (schedule === void 0) throw new ActionError("E_NO_SCHEDULE", "DSH \u5B9A\u65F6\u4EFB\u52A1\u670D\u52A1\u4E0D\u53EF\u7528");
      await schedule.edit({ id: taskId, action: "delete" });
      removed += 1;
      for (const state of Object.values(file.jobs)) {
        if (state.taskId === taskId) {
          state.taskId = null;
          state.enabled = false;
        }
      }
      await deps.jobs.save(file);
      return { receipt: { action: "J.delete", changed: 1, created: 0, removed, ms: 0, notes: [] } };
    }
    case "J.reconcile": {
      const schedule = deps.schedule();
      if (schedule === void 0) throw new ActionError("E_NO_SCHEDULE", "DSH \u5B9A\u65F6\u4EFB\u52A1\u670D\u52A1\u4E0D\u53EF\u7528");
      const file = await deps.jobs.load();
      const result = await reconcile(schedule, file, deps.store.libraryPath, deps.libraryName);
      if (result.changed) await deps.jobs.save(file);
      return { receipt: { action: "J.reconcile", changed: result.changed ? 1 : 0, created: result.created.length, removed: result.deleted.length, ms: 0, notes: [] }, detail: result };
    }
    case "J.toggle": {
      const id = String(params.id ?? "");
      const enabled = params.enabled === true;
      const file = await deps.jobs.load();
      const state = file.jobs[id];
      if (state === void 0) throw new ActionError("E_NOT_FOUND", `\u6CA1\u6709\u4EFB\u52A1 ${id}`);
      state.enabled = enabled;
      if (params.options !== void 0 && typeof params.options === "object") {
        state.options = { ...state.options, ...params.options };
      }
      const schedule = deps.schedule();
      if (schedule !== void 0) {
        const result = await reconcile(schedule, file, deps.store.libraryPath, deps.libraryName);
        await deps.jobs.save(file);
        return { receipt: { action: "J.toggle", changed: 1, created: result.created.length, removed: result.deleted.length, ms: 0, notes: [] }, detail: result };
      }
      await deps.jobs.save(file);
      return { receipt: { action: "J.toggle", changed: 1, created: 0, removed: 0, ms: 0, notes: ["\u5B9A\u65F6\u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u4EC5\u4FDD\u5B58\u4E86\u8BBE\u7F6E"] } };
    }
    default:
      throw new ActionError("E_ACTION_UNKNOWN", `\u672A\u77E5\u52A8\u4F5C ${action}`);
  }
}

// host/obsidian.ts
import { execFile as execFile4 } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename as basename3, dirname, join as join4, normalize, relative, resolve, sep } from "node:path";
function vaultNameOf(libraryPath, configured) {
  const clean = (configured ?? "").trim();
  return clean !== "" ? clean : basename3(libraryPath);
}
function openUri(vault, relPath) {
  const normalized = relPath.replace(/^\/+/, "").replace(/\.md$/i, "");
  const params = new URLSearchParams({ vault, file: normalized });
  return `obsidian://open?${params.toString()}`;
}
function vaultUri(vault) {
  return `obsidian://open?${new URLSearchParams({ vault }).toString()}`;
}
function registryPath() {
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return join4(home, "Library", "Application Support", "obsidian", "obsidian.json");
    case "win32":
      return join4(process.env.APPDATA ?? join4(home, "AppData", "Roaming"), "obsidian", "obsidian.json");
    default:
      return join4(process.env.XDG_CONFIG_HOME ?? join4(home, ".config"), "obsidian", "obsidian.json");
  }
}
function canonical(path) {
  const full = normalize(resolve(path)).replace(/[\\/]+$/, "");
  return process.platform === "linux" ? full : full.toLowerCase();
}
function readRegistry(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed === null || typeof parsed !== "object") return {};
    if (parsed.vaults === void 0 || parsed.vaults === null) parsed.vaults = {};
    return parsed;
  } catch {
    return {};
  }
}
function findVaultId(vaultPath) {
  const file = registryPath();
  if (!existsSync(file)) return void 0;
  const registry = readRegistry(file);
  const wanted = canonical(vaultPath);
  for (const [id, vault] of Object.entries(registry.vaults ?? {})) {
    if (typeof vault?.path === "string" && canonical(vault.path) === wanted) return id;
  }
  return void 0;
}
function registerVault(vaultPath) {
  const file = registryPath();
  const existing = findVaultId(vaultPath);
  if (existing !== void 0) return { id: existing, changed: false };
  const registry = readRegistry(file);
  const id = randomBytes(8).toString("hex");
  registry.vaults = {
    ...registry.vaults ?? {},
    [id]: { path: normalize(resolve(vaultPath)), ts: Date.now() }
  };
  const backup = `${file}.bak-${Date.now()}`;
  try {
    mkdirSync(join4(file, ".."), { recursive: true });
    if (existsSync(file)) copyFileSync(file, backup);
    writeFileSync(file, `${JSON.stringify(registry, null, 2)}
`, "utf8");
  } catch (error) {
    throw new Error(`\u5199 Obsidian vault \u6E05\u5355\u5931\u8D25\uFF08${file}\uFF09\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
  return { id, changed: true, backup: existsSync(file) ? backup : void 0 };
}
function appInstalled() {
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return existsSync("/Applications/Obsidian.app") || existsSync(join4(home, "Applications", "Obsidian.app"));
    case "win32":
      return existsSync(join4(process.env.LOCALAPPDATA ?? "", "Obsidian", "Obsidian.exe")) || existsSync(join4(process.env.PROGRAMFILES ?? "", "Obsidian", "Obsidian.exe"));
    default:
      return existsSync(registryPath()) || existsSync("/usr/bin/obsidian") || existsSync("/opt/Obsidian/obsidian");
  }
}
function isRunning() {
  const [command, args] = process.platform === "win32" ? ["tasklist", ["/FI", "IMAGENAME eq Obsidian.exe"]] : ["pgrep", ["-x", "Obsidian"]];
  return new Promise((resolvePromise) => {
    execFile4(command, args, { timeout: 3e3 }, (error, stdout) => {
      if (error !== null) {
        resolvePromise(false);
        return;
      }
      resolvePromise(process.platform === "win32" ? /obsidian\.exe/i.test(stdout) : stdout.trim() !== "");
    });
  });
}
function openUrl(url) {
  const [command, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  return new Promise((resolvePromise, reject) => {
    execFile4(command, args, { timeout: 8e3 }, (error) => {
      if (error === null) resolvePromise();
      else reject(error);
    });
  });
}
function openFolderWithApp(folder) {
  const [command, args] = process.platform === "darwin" ? ["open", ["-a", "Obsidian", folder]] : process.platform === "win32" ? [join4(process.env.LOCALAPPDATA ?? "", "Obsidian", "Obsidian.exe"), [folder]] : ["obsidian", [folder]];
  return new Promise((resolvePromise, reject) => {
    execFile4(command, args, { timeout: 1e4 }, (error) => {
      if (error === null) resolvePromise();
      else reject(error);
    });
  });
}
function hasObsidianConfig(dir) {
  return existsSync(join4(dir, ".obsidian"));
}
function enclosingVault(vaultPath) {
  let current = resolve(vaultPath);
  for (let depth = 0; depth < 6; depth += 1) {
    const parent = dirname(current);
    if (parent === current) return void 0;
    if (hasObsidianConfig(parent)) return parent;
    current = parent;
  }
  return void 0;
}
function resolveOpenTarget(input) {
  const relPath = (input.relPath ?? "").trim();
  const outer = enclosingVault(input.vaultPath);
  const explicit = (input.explicitVaultName ?? "").trim();
  const outerName = outer === void 0 ? "" : basename3(outer);
  const wantsOwnVault = explicit !== "" && outerName !== "" && explicit !== outerName;
  if (outer !== void 0 && !wantsOwnVault) {
    const inner = relative(outer, resolve(input.vaultPath)).split(sep).join("/");
    const innerPath = inner === "" || inner === "." ? "" : inner;
    const file = [innerPath, relPath].filter((part) => part !== "").join("/");
    return {
      vaultPath: outer,
      vaultName: outerName,
      uri: file === "" ? vaultUri(outerName) : openUri(outerName, file),
      mode: "enclosing",
      innerPath
    };
  }
  const name2 = vaultNameOf(input.vaultPath, explicit);
  return {
    vaultPath: input.vaultPath,
    vaultName: name2,
    uri: relPath === "" ? vaultUri(name2) : openUri(name2, relPath),
    mode: "library",
    innerPath: ""
  };
}
function cliOpen(vault, relPath) {
  return new Promise((resolvePromise, reject) => {
    execFile4("obsidian", [`vault=${vault}`, "open", `path=${relPath}`], { timeout: 8e3 }, (error) => {
      if (error === null) resolvePromise();
      else reject(error);
    });
  });
}
async function openInObsidian(input) {
  const target = resolveOpenTarget(input);
  const relPath = (input.relPath ?? "").trim();
  const innerFile = [target.innerPath, relPath].filter((part) => part !== "").join("/");
  if (!appInstalled()) {
    return {
      ok: false,
      via: "none",
      uri: target.uri,
      note: "",
      registered: false,
      error: {
        code: "E_NO_OBSIDIAN",
        message: "\u8FD9\u53F0\u673A\u5668\u4E0A\u6CA1\u627E\u5230 Obsidian \u5BA2\u6237\u7AEF\uFF1A\u88C5\u597D Obsidian \u518D\u70B9\u300C\u6253\u5F00\u77E5\u8BC6\u5E93\u300D\uFF0C\u6216\u8005\u5148\u624B\u5DE5\u6253\u5F00\u4E00\u6B21\u8FD9\u4E2A\u6587\u4EF6\u5939\u3002"
      }
    };
  }
  const known = findVaultId(target.vaultPath) !== void 0;
  const running = await isRunning();
  let registered = known;
  let registerNote = "";
  let registerError = "";
  try {
    const outcome = registerVault(target.vaultPath);
    registered = true;
    if (outcome.changed && target.mode === "library") registerNote = "\u5DF2\u628A\u8FD9\u4E2A\u5E93\u767B\u8BB0\u5230 Obsidian";
  } catch (error) {
    registerError = error instanceof Error ? error.message : String(error);
  }
  const where = target.mode === "enclosing" ? `${target.vaultName}\uFF08\u6CBF\u7528\u5B83\u7684\u5916\u89C2\u4E0E\u63D2\u4EF6\u8BBE\u7F6E\uFF09` : target.vaultName;
  const succeed = (via, note) => ({
    ok: true,
    via,
    uri: target.uri,
    registered,
    note: [note, registerNote].filter(Boolean).join("\uFF1B")
  });
  const attempts = [];
  if (running && innerFile !== "") {
    attempts.push({ via: "cli", run: () => cliOpen(target.vaultName, innerFile), note: `\u5DF2\u5728 Obsidian \u6253\u5F00 ${target.vaultName} \u203A ${innerFile}` });
  }
  if (known) {
    attempts.push({ via: "url", run: () => openUrl(target.uri), note: `\u5DF2\u5728 Obsidian \u6253\u5F00 ${where}` });
  }
  if (running && innerFile === "") {
    attempts.push({
      via: "app",
      run: () => openFolderWithApp(target.mode === "enclosing" ? target.vaultPath : input.vaultPath),
      note: `\u5DF2\u8BA9 Obsidian \u6253\u5F00 ${where}`
    });
  }
  if (!known) {
    attempts.push({ via: "url", run: () => openUrl(target.uri), note: `\u5DF2\u5728 Obsidian \u6253\u5F00 ${where}` });
  }
  if (innerFile !== "") {
    attempts.push({
      via: "app",
      run: () => openFolderWithApp(target.mode === "enclosing" ? target.vaultPath : input.vaultPath),
      note: `\u5DF2\u8BA9 Obsidian \u6253\u5F00 ${where}`
    });
    attempts.push({ via: "cli", run: () => cliOpen(target.vaultName, innerFile), note: `\u5DF2\u5728 Obsidian \u6253\u5F00 ${target.vaultName} \u203A ${innerFile}` });
  } else if (!running) {
    attempts.push({
      via: "app",
      run: () => openFolderWithApp(target.mode === "enclosing" ? target.vaultPath : input.vaultPath),
      note: `\u5DF2\u8BA9 Obsidian \u6253\u5F00 ${where}`
    });
  }
  for (const attempt of attempts) {
    try {
      await attempt.run();
      return succeed(attempt.via, attempt.note);
    } catch {
      continue;
    }
  }
  return {
    ok: false,
    via: "none",
    uri: target.uri,
    registered,
    note: "",
    error: {
      code: "E_LAUNCH_FAILED",
      message: registerError === "" ? "\u6CA1\u80FD\u5524\u8D77 Obsidian\uFF1A\u7CFB\u7EDF\u62D2\u7EDD\u4E86\u6253\u5F00\u547D\u4EE4\u3002\u53EF\u4EE5\u624B\u5DE5\u6253\u5F00 Obsidian\uFF0C\u518D\u70B9\u4E00\u6B21\u8FD9\u4E2A\u6309\u94AE\u3002" : `\u6CA1\u80FD\u5524\u8D77 Obsidian\uFF1A${registerError}`
    }
  };
}
async function probeBinary(binary) {
  return new Promise((resolvePromise) => {
    execFile4(binary, ["--help"], { timeout: 4e3 }, (error) => {
      resolvePromise(error === null || error?.code !== "ENOENT");
    });
  });
}
async function detectCli() {
  for (const binary of ["obsidian-cli"]) {
    if (!await probeBinary(binary)) continue;
    return {
      binary,
      open: (vault, relPath) => new Promise((resolvePromise, reject) => {
        const note = relPath.replace(/^\/+/, "").replace(/\.md$/i, "");
        execFile4(binary, ["open", "--vault", vault, note], (error) => {
          if (error !== null) reject(error);
          else resolvePromise();
        });
      })
    };
  }
  return void 0;
}

// host/space.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { mkdir, readdir as readdir2, stat as stat2, writeFile } from "node:fs/promises";
import { join as join5 } from "node:path";

// core/bootstrap.ts
var WIKI_DIRECTORIES = [
  WIKI_LAYOUT.inboxNotes,
  WIKI_LAYOUT.inboxFiles,
  WIKI_LAYOUT.inboxParts,
  WIKI_LAYOUT.inboxCollect,
  WIKI_LAYOUT.rawDir,
  WIKI_LAYOUT.attachments,
  WIKI_LAYOUT.wikiDir,
  ...["entity", "concept", "source", "answer", "project"].map((type) => `${WIKI_LAYOUT.wikiDir}/${PAGE_TYPE_SEGMENT[type]}`),
  WIKI_LAYOUT.proposalDir,
  WIKI_LAYOUT.backupDir,
  WIKI_LAYOUT.trashDir
];
var GITIGNORE = `# llm-wiki \u4E2D\u95F4\u7269
3-review/.backup/
3-review/.trash/
0-inbox/files/.parts/
.DS_Store
`;
var SCHEMA_STUB = `# WIKI.md \xB7 \u672C\u5E93\u7684\u5199\u4F5C\u4E0E\u7EF4\u62A4\u89C4\u8303

> \u672C\u6587\u4EF6\u7531 llm-wiki \u63D2\u4EF6\u751F\u6210\u3002\u5B83\u63CF\u8FF0\u7684\u662F**\u4EE3\u7801\u91CC\u5DF2\u7ECF\u751F\u6548\u7684\u89C4\u5219**\uFF0C
> \u624B\u6539\u8FD9\u91CC\u4E0D\u4F1A\u6539\u53D8\u4EFB\u4F55\u884C\u4E3A\uFF1B\u8981\u6539\u89C4\u5219\uFF0C\u6539\u63D2\u4EF6\u3002

## \u56DB\u4E2A\u9636\u6BB5\u76EE\u5F55

| \u76EE\u5F55 | \u542B\u4E49 | \u8C01\u5199 | \u8FDB\u7D22\u5F15 |
|---|---|---|---|
| \`0-inbox/\` | \u5F85\u786E\u8BA4\u7D20\u6750\uFF1A\u7B14\u8BB0\u3001\u4E0A\u4F20\u6587\u4EF6\u3001\u91C7\u96C6\u7ED3\u679C | \u4EBA / \u91C7\u96C6\u4EFB\u52A1 | \u5426 |
| \`1-raw/\` | \u5DF2\u786E\u8BA4\u7D20\u6750\uFF0C\u53EA\u8FFD\u52A0\u4E0D\u6539\u5199 | \u786E\u8BA4\u52A8\u4F5C | \u5426 |
| \`2-wiki/\` | \u5DF2\u7F16\u8BD1\u77E5\u8BC6\uFF0C\u4EBA\u548C agent \u90FD\u8BFB | \u7F16\u8BD1 / \u5408\u5E76 | \u662F |
| \`3-review/\` | \u5F85\u88C1\u51B3\u63D0\u6848\uFF08\u7B49\u4EF7\u4E8E PR\uFF09 | agent | \u5426 |

\u70B9\u5F00\u5934\u7684 \`3-review/.backup\`\u3001\`3-review/.trash\`\u3001\`0-inbox/files/.parts\`
\u662F\u4E2D\u95F4\u7269\u4E0E\u56DE\u6536\u7AD9\uFF0C\u6C38\u8FDC\u4E0D\u8FDB\u7D22\u5F15\uFF0C\u4E5F\u4E0D\u8FDB git\u3002

## \u9875\u9762\uFF082-wiki\uFF09

- \u76EE\u5F55\u51B3\u5B9A\u7C7B\u578B\uFF1A\`2-wiki/{entities,concepts,sources,answers,projects}/<slug>.md\`
- \u5FC5\u5907 frontmatter\uFF1A\`id\`\u3001\`type\`\u3001\`title\`\u3001\`summary\`(\u2264120 \u5B57)\u3001\`status\`\u3001\`created\`\u3001\`updated\`
- \u53EF\u9009\uFF1A\`aliases\`\u3001\`tags\`\u3001\`sources\`\u3001\`domain\`\u3001\`confidence\`
- \u6B63\u6587\u5FC5\u5907\u6BB5\uFF1A\`## \u6458\u8981\`\u3001\`## \u8981\u70B9\`\u3001\`## \u5173\u8054\`\u3001\`## \u51FA\u5904\`
- \`## \u5173\u8054\` \u81F3\u5C11\u4E00\u6761 [[wikilink]]\uFF0C\u4E14\u5FC5\u987B\u6307\u5411\u5DF2\u5B58\u5728\u7684\u9875\uFF1B\u65AD\u94FE\u662F error
- \u975E stub \u9875\u5FC5\u987B\u6709 \`sources\`\uFF1A\u6CA1\u6709\u51FA\u5904\u7684\u65AD\u8A00\u4E0D\u8FDB\u5E93
- \u4E00\u9875\u53EA\u8BB2\u4E00\u4EF6\u4E8B\uFF1B\u540C\u4E49\u5185\u5BB9\u5408\u5E76\u800C\u4E0D\u662F\u65B0\u5EFA

## \u72B6\u6001

\`stub\`\uFF08\u5360\u4F4D\uFF09\u2192 \`active\`\uFF08\u53EF\u7528\uFF09\u2192 \`contested\`\uFF08\u6709\u77DB\u76FE\uFF0C\u5F85\u88C1\u51B3\uFF09\u2192 \`deprecated\`\uFF08\u5DF2\u5E9F\u6B62\uFF09

\`deprecated\` \u9875**\u4E0D\u642C\u5BB6**\uFF1A\u539F\u5730\u4FDD\u7559\uFF0C\u9875\u9996\u5FC5\u987B\u5199\u6E05\u300C\u4E3A\u4F55\u5E9F\u6B62 / \u88AB\u8C01\u66FF\u4EE3 / \u6700\u540E\u6709\u6548\u65E5\u671F\u300D\u3002
\u68C0\u7D22\u9ED8\u8BA4\u4E0D\u8FD4\u56DE\u5B83\uFF0C\u65E7\u94FE\u63A5\u4E5F\u4E0D\u4F1A\u65AD\u3002

## \u9886\u57DF

\u9886\u57DF\u5199\u5728 frontmatter \u7684 \`domain\`\uFF0C\u4E0D\u662F\u76EE\u5F55\u3002\u8FD9\u6837 id \u6C38\u8FDC\u7A33\u5B9A\uFF0C
\u5C06\u6765\u8981\u6309\u9886\u57DF\u62C6\u5E93\uFF0C\u4E5F\u53EA\u662F\u6309 \`domain\` \u7B5B\u4E00\u904D\u518D\u642C\u8DEF\u5F84\uFF0C\u94FE\u63A5\u4E0D\u4F1A\u7834\u3002

## \u63D0\u6848\uFF083-review\uFF09

\u63D0\u6848\u6587\u4EF6\u662F"\u62DF\u5199\u5165\u7684\u5B8C\u6574\u9875\u9762 + \u4E00\u53E5\u7406\u7531 + \u751F\u6210\u65F6\u76EE\u6807\u9875\u7684\u7248\u672C"\u3002
\u5408\u5E76\u65F6\u4F1A\u6821\u9A8C\u7248\u672C\uFF1A\u76EE\u6807\u9875\u5728\u6B64\u671F\u95F4\u6539\u8FC7\uFF0C\u5C31\u62A5\u51B2\u7A81\u3001\u4E0D\u8986\u76D6\u3002
\u63D0\u6848\u4FDD\u7559 \`7\` \u5929\u540E\u7531\u8FC7\u671F\u6E05\u7406\u4EFB\u52A1\u6536\u8D70\u3002

## \u5DE5\u4F5C\u6D41

1. **\u6444\u53D6**\uFF1A\u7B14\u8BB0 / \u4E0A\u4F20 / \u91C7\u96C6 \u2192 \`0-inbox/\`
2. **\u786E\u8BA4**\uFF1A\u4EBA\u770B\u4E00\u773C\uFF0C\u786E\u8BA4\u540E\u624D\u8FDB \`1-raw/\`\uFF08\u914D\u7F6E\u53EF\u653E\u5F00\u81EA\u52A8\u786E\u8BA4\uFF09
3. **\u7F16\u8BD1**\uFF1A\`1-raw/\` \u7684\u7D20\u6750 \u2192 \u67E5\u91CD\u3001\u67E5\u77DB\u76FE \u2192 \u5728 \`3-review/\` \u751F\u6210\u63D0\u6848
4. **\u88C1\u51B3**\uFF1A\u5408\u5E76\u63D0\u6848 \u2192 \u843D \`2-wiki/\` \u2192 \u91CD\u5EFA\u7D22\u5F15
5. **\u7EF4\u62A4**\uFF1A\u4F53\u68C0\u3001\u53BB\u91CD\u3001\u77DB\u76FE\u3001\u8FC7\u671F\u63A8\u9001\u3001\u6E05\u7406\uFF0C\u90FD\u7531\u4EFB\u52A1\u627F\u62C5
`;
function bootstrapFiles(now) {
  return [
    { path: `${WIKI_LAYOUT.wikiDir}/index.md`, text: renderIndex(buildSnapshot([]), { updated: now }) },
    {
      path: `${WIKI_LAYOUT.wikiDir}/log.md`,
      text: appendLog("", logEntry({ now, operation: "index", summary: "\u521D\u59CB\u5316\u7A7A\u5E93\u9AA8\u67B6\u3002" }))
    },
    { path: WIKI_LAYOUT.schemaFile, text: SCHEMA_STUB },
    {
      path: WIKI_LAYOUT.jobsFile,
      text: `${JSON.stringify({ version: 1, library: "", jobs: {} }, null, 2)}
`
    },
    { path: ".gitignore", text: GITIGNORE }
  ];
}

// host/space.ts
var SPACE_STATE_FILE = ".llm-wiki-space.json";
function stateFileOf(spacePath) {
  return join5(spacePath, SPACE_STATE_FILE);
}
function readActive(spacePath) {
  try {
    const raw = readFileSync2(stateFileOf(spacePath), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.active !== "string" || parsed.active.trim() === "") return void 0;
    return parsed.active.trim();
  } catch {
    return void 0;
  }
}
async function writeActive(spacePath, name2) {
  await mkdir(spacePath, { recursive: true });
  const state = { version: 1, active: name2 };
  await writeFile(stateFileOf(spacePath), `${JSON.stringify(state, null, 2)}
`, "utf8");
}
function looksLikeLibrary(path) {
  return existsSync2(join5(path, WIKI_LAYOUT.schemaFile)) || existsSync2(join5(path, WIKI_LAYOUT.inboxDir));
}
async function listLibraries(spacePath) {
  let names = [];
  try {
    const entries = await readdir2(spacePath, { withFileTypes: true });
    names = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
  const libraries = [];
  for (const name2 of names) {
    const path = join5(spacePath, name2);
    libraries.push({ name: name2, path, initialized: looksLikeLibrary(path) });
  }
  return libraries;
}
async function initLibrary(spacePath, name2, now) {
  const trimmed = name2.trim();
  if (trimmed === "" || trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`\u4E0D\u662F\u5408\u6CD5\u7684\u5E93\u540D\uFF1A${name2}`);
  }
  if (trimmed.startsWith(".")) throw new Error(`\u5E93\u540D\u4E0D\u80FD\u4EE5\u70B9\u5F00\u5934\uFF1A${trimmed}`);
  const path = join5(spacePath, trimmed);
  const info = await stat2(path).catch(() => void 0);
  if (info !== void 0 && !info.isDirectory()) throw new Error(`${path} \u4E0D\u662F\u76EE\u5F55`);
  const created = [];
  const skipped = [];
  await mkdir(path, { recursive: true });
  for (const directory of WIKI_DIRECTORIES) {
    const absolute = join5(path, directory);
    if (existsSync2(absolute)) {
      skipped.push(directory);
      continue;
    }
    await mkdir(absolute, { recursive: true });
    created.push(directory);
  }
  for (const file of bootstrapFiles(now)) {
    const absolute = join5(path, file.path);
    if (existsSync2(absolute)) {
      skipped.push(file.path);
      continue;
    }
    await writeFile(absolute, file.text, "utf8");
    created.push(file.path);
  }
  return { library: { name: trimmed, path, initialized: true }, created, skipped };
}

// host/tools.ts
import { defineTool, ToolArgsError } from "@deepseek-ai/dsh-tools";
var TEXT = (text) => [{ type: "text", text }];
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function outlineOf(body) {
  const lines = body.split("\n").filter((line) => /^#{1,3}\s/.test(line));
  return lines.length === 0 ? "\uFF08\u65E0\u6807\u9898\u5C42\u7EA7\uFF09" : lines.join("\n");
}
function composeContent(page, mode) {
  if (mode === "toc") return outlineOf(page.body);
  const limit = mode === "full" ? LIMITS.fullPageChars : LIMITS.headChars;
  if (page.body.length <= limit) return page.body;
  return `${page.body.slice(0, limit)}

\u2026\uFF08${mode} \u6A21\u5F0F\u622A\u65AD\u4E8E ${limit} \u5B57\u7B26\uFF1B\u9700\u8981\u5168\u6587\u7528 mode=full\uFF09`;
}
function typeFilter(values) {
  if (values === void 0 || values.length === 0) return void 0;
  const invalid = values.filter((value) => !CONTENT_TYPES.includes(value));
  if (invalid.length > 0) throw new ToolArgsError([`\u672A\u77E5 type\uFF1A${invalid.join(", ")}\uFF1B\u53EF\u7528 ${CONTENT_TYPES.join(" / ")}`]);
  return values;
}
function hitLine(index, hit) {
  return `${index + 1}. [${hit.type}/${hit.status}] ${hit.title} \u2014 \`${hit.id}\`${hit.inbound > 0 ? ` \xB7 \u2190${hit.inbound}` : ""}
   ${hit.summary}`;
}
function registerWikiTools(ctx, deps) {
  const { store, actions } = deps;
  ctx.tools.register(defineTool({
    name: "wiki_search",
    description: [
      "Search the wiki by title, alias, tag, summary and id. Returns pointers only (id + \u2264110 \u5B57\u6458\u8981), never full text.",
      "Always search before creating a page: an existing page usually should be updated instead of duplicated."
    ].join(" "),
    parameters: {
      query: { type: "string", required: true, description: "\u5173\u952E\u8BCD\uFF1B\u7A7A\u683C\u5206\u8BCD\uFF0C\u5168\u90E8\u547D\u4E2D\u4F18\u5148\u3002\u7A7A\u4E32\u8FD4\u56DE\u6309\u5165\u94FE\u6392\u5E8F\u7684\u6982\u89C8\u3002" },
      domain: { type: "string", description: "\u9650\u5B9A\u9886\u57DF\uFF08frontmatter.domain\uFF09\u3002" },
      types: { type: "array", items: { type: "string", enum: [...CONTENT_TYPES] }, description: "\u9650\u5B9A\u9875\u9762\u7C7B\u578B\u3002" },
      limit: { type: "number", description: `\u8FD4\u56DE\u6761\u6570\u4E0A\u9650\uFF0C\u9ED8\u8BA4 ${deps.maxCandidates}\uFF0C\u6700\u5927 20\u3002` },
      include_deprecated: { type: "boolean", description: "\u662F\u5426\u5305\u542B\u5DF2\u5E9F\u6B62\u9875\uFF08\u9ED8\u8BA4\u4E0D\u542B\uFF09\u3002" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          hits: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", required: true },
                title: { type: "string", required: true },
                type: { type: "string", required: true },
                status: { type: "string", required: true },
                summary: { type: "string", required: true },
                domain: { type: "string", required: true },
                updated: { type: "string", required: true },
                score: { type: "number", required: true },
                inbound: { type: "integer", required: true }
              }
            }
          },
          hint: { type: "string", required: true }
        }
      },
      render: (_args, value) => TEXT(value.hits.length === 0 ? `\u6CA1\u6709\u547D\u4E2D\u3002\u6362\u4E00\u7EC4\u8BCD\uFF0C\u6216\u5148\u4ECE 0-inbox \u786E\u8BA4\u7D20\u6750 / \u8BA9\u91C7\u96C6\u4EFB\u52A1\u9001\u6599\u3002
${value.hint}` : `\u547D\u4E2D ${value.hits.length} \u9875\uFF1A
${value.hits.map((hit, index) => hitLine(index, hit)).join("\n")}

${value.hint}`)
    },
    presentCall: (args) => ({ card: "generic", title: `\u641C\u7D22 wiki\uFF1A${args.query || "\uFF08\u6982\u89C8\uFF09"}`, kind: "search" }),
    async execute(args) {
      const { snapshot } = await store.load();
      const limit = Math.max(1, Math.min(args.limit ?? deps.maxCandidates, 20));
      const hits = searchPages(snapshot, args.query ?? "", {
        types: typeFilter(args.types),
        domain: args.domain,
        limit,
        includeDeprecated: args.include_deprecated === true
      });
      return {
        hits: hits.map((hit) => ({
          id: hit.id,
          title: hit.title,
          type: hit.type,
          status: hit.status,
          summary: hit.summary,
          domain: hit.domain ?? "",
          updated: hit.updated,
          score: hit.score,
          inbound: hit.inbound
        })),
        hint: hits.length > 0 ? "\u4E0B\u4E00\u6B65\uFF1Awiki_read \u6700\u76F8\u5173\u7684 2\u20134 \u9875\uFF08mode=head\uFF09\uFF0C\u9700\u8981\u7EC6\u8282\u518D mode=full\uFF1B\u4E0D\u8981\u4E00\u6B21\u8BFB\u5341\u9875\u3002" : "\u82E5\u786E\u5B9E\u7F3A\u9875\uFF1A\u5148\u770B 0-inbox / 1-raw \u91CC\u6709\u6CA1\u6709\u80FD\u7F16\u8BD1\u7684\u7D20\u6750\uFF0C\u518D\u8003\u8651 wiki_write \u5EFA stub\u3002"
      };
    }
  }));
  ctx.tools.register(defineTool({
    name: "wiki_read",
    description: [
      "Read wiki pages by id (index/log allowed). Modes: head (frontmatter + \u524D\u540E 1200 \u5B57), toc (\u6807\u9898\u5C42\u7EA7), full (\u226412000 \u5B57).",
      "Each page returns its \u5173\u8054\u51FA\u94FE\u3001\u53CD\u94FE\u4E0E lint \u6458\u8981\uFF0C\u65B9\u4FBF\u6CBF\u94FE\u63A5\u8DF3\uFF0C\u800C\u4E0D\u662F\u91CD\u65B0\u641C\u7D22\u3002"
    ].join(" "),
    parameters: {
      ids: { type: "array", required: true, items: { type: "string" }, description: `\u9875\u9762 id\uFF08\u5982 concepts/x\u3001index\uFF09\u3002\u4E00\u6B21\u6700\u591A ${LIMITS.readBatch} \u9875\u3002` },
      mode: { type: "string", enum: ["head", "toc", "full"], description: "\u8BFB\u53D6\u6DF1\u5EA6\uFF0C\u9ED8\u8BA4 head\u3002" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          pages: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", required: true },
                title: { type: "string", required: true },
                status: { type: "string", required: true },
                domain: { type: "string", required: true },
                updated: { type: "string", required: true },
                content: { type: "string", required: true },
                related: { type: "array", required: true, items: { type: "string" } },
                backlinks: { type: "array", required: true, items: { type: "string" } },
                health: { type: "string", required: true }
              }
            }
          },
          missing: { type: "array", required: true, items: { type: "string" } }
        }
      },
      render: (_args, value) => TEXT([
        value.pages.map((page) => [
          `## ${page.title} \u2014 \`${page.id}\`  [${page.status}]${page.domain === "" ? "" : ` \xB7 ${page.domain}`}`,
          page.content,
          `\u5173\u8054\uFF1A${page.related.length === 0 ? "\uFF08\u65E0\uFF09" : page.related.join("\u3001")}`,
          `\u53CD\u94FE\uFF1A${page.backlinks.length === 0 ? "\uFF08\u65E0\uFF09" : page.backlinks.join("\u3001")}`,
          `\u5065\u5EB7\uFF1A${page.health}`
        ].join("\n")).join("\n\n"),
        value.missing.length === 0 ? "" : `\u672A\u627E\u5230\uFF1A${value.missing.join("\u3001")}\uFF08\u5148\u7528 wiki_search \u786E\u8BA4 id\uFF09`
      ].filter(Boolean).join("\n\n"))
    },
    presentCall: (args) => ({ card: "generic", title: `\u8BFB\u53D6 ${args.ids.length} \u9875`, kind: "read" }),
    async execute(args) {
      const ids = args.ids.slice(0, LIMITS.readBatch);
      if (ids.length === 0) throw new ToolArgsError(["ids \u4E0D\u80FD\u4E3A\u7A7A"]);
      const mode = args.mode ?? "head";
      const loaded = await store.load();
      const { snapshot } = loaded;
      const findings = lintSnapshot(snapshot, { indexText: loaded.indexText, proposalCount: loaded.proposals.length, now: nowIso() });
      const pages = [];
      const missing = [];
      for (const id of ids) {
        const page = snapshot.byId.get(id);
        if (page === void 0) {
          missing.push(id);
          continue;
        }
        const health = page.type === "index" || page.type === "log" ? "ok" : pageHealth(snapshot, page, findings.filter((item) => item.page === id)).status;
        pages.push({
          id: page.id,
          title: page.title,
          status: page.status,
          domain: page.domain ?? "",
          updated: page.updated,
          content: composeContent(page, mode),
          related: relatedOf(snapshot, id),
          backlinks: backlinksOf(snapshot, id),
          health
        });
      }
      return { pages, missing };
    }
  }));
  ctx.tools.register(defineTool({
    name: "wiki_write",
    description: [
      "Create or update a wiki page through the schema gate. Default mode=propose writes a proposal into 3-review/; mode=direct writes 2-wiki/ only when the plugin config allows it.",
      "A page must carry `## \u5173\u8054` with at least one wikilink to an existing page; active/contested pages need sources."
    ].join(" "),
    parameters: {
      mode: { type: "string", enum: ["propose", "direct"], description: "\u9ED8\u8BA4 propose\u3002" },
      action: { type: "string", enum: ["create", "update", "deprecate"], description: "\u5199\u5165\u610F\u56FE\u3002" },
      target: { type: "string", required: true, description: "\u76EE\u6807\u9875 id\uFF0C\u5982 concepts/x\u3002" },
      body: { type: "string", required: true, description: "\u5B8C\u6574\u9875\u9762\u6B63\u6587\uFF08\u542B `# \u6807\u9898` \u4E0E\u5404\u6BB5\uFF09\u3002" },
      title: { type: "string", required: true, description: "\u9875\u9762\u6807\u9898\u3002" },
      summary: { type: "string", required: true, description: `\u4E00\u53E5\u8BDD\u6458\u8981\uFF0C\u2264${LIMITS.summaryChars} \u5B57\u3002` },
      sources: { type: "array", items: { type: "string" }, description: "\u51FA\u5904\uFF1A\u7D20\u6750 id\uFF08raw/xxx\uFF09\u6216\u6765\u6E90\u9875 id\u3002" },
      tags: { type: "array", items: { type: "string" }, description: "\u6807\u7B7E\u3002" },
      aliases: { type: "array", items: { type: "string" }, description: "\u522B\u540D\uFF082\u20135 \u4E2A\uFF0C\u7528\u4E8E\u68C0\u7D22\u4E0E\u77ED\u94FE\uFF09\u3002update \u65F6\u7701\u7565\u5219\u4FDD\u7559\u539F\u503C\u3002" },
      domain: { type: "string", description: "\u9886\u57DF\uFF1B\u4E0D\u786E\u5B9A\u5C31\u7559\u7A7A\u3002update \u65F6\u7701\u7565\u5219\u4FDD\u7559\u539F\u503C\u3002" },
      reason: { type: "string", description: "\u4E3A\u4EC0\u4E48\u6539\uFF08\u4F1A\u5199\u8FDB\u63D0\u6848\uFF09\u3002" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          written: { type: "string", required: true },
          mode: { type: "string", required: true },
          warnings: { type: "array", required: true, items: { type: "string" } }
        }
      },
      render: (_args, value) => TEXT(`\u5DF2\u5199\u5165 ${value.mode === "propose" ? "\u63D0\u6848" : "\u9875\u9762"}\uFF1A\`${value.written}\`${value.warnings.length === 0 ? "" : `
\u6CE8\u610F\uFF1A${value.warnings.join("\uFF1B")}`}`)
    },
    presentCall: (args) => ({ card: "generic", title: `\u5199\u5165 ${args.target}`, kind: "edit" }),
    async execute(args) {
      const loaded = await store.load();
      const { snapshot } = loaded;
      const type = args.target.split("/")[0] === "entities" ? "entity" : args.target.split("/")[0] === "concepts" ? "concept" : args.target.split("/")[0] === "sources" ? "source" : args.target.split("/")[0] === "answers" ? "answer" : args.target.split("/")[0] === "projects" ? "project" : "concept";
      const before = snapshot.byId.get(args.target);
      const draft = {
        id: args.target,
        type,
        title: args.title,
        summary: args.summary,
        body: args.body,
        // deprecate 显式降级；其余情况沿用原页状态（新建时由 buildPageText 兜底 active）。
        // 不要把 update 硬写成 active，否则改一条反链就会把 deprecated 页悄悄复活。
        status: args.action === "deprecate" ? "deprecated" : before?.status ?? "active",
        tags: args.tags,
        aliases: args.aliases,
        sources: args.sources,
        domain: args.domain
      };
      const validation = validateDraft(draft, snapshot, store.libraryPath, {
        allowExisting: args.action !== "create",
        existing: before
      });
      if (validation.errors.length > 0) throw new ToolArgsError(validation.errors);
      const now = nowIso();
      const pageText = buildPageText(draft, { now, existing: before });
      const direct = args.mode === "direct" || deps.writeMode === "direct";
      if (!direct) {
        const path2 = proposalPath(store.libraryPath, args.target, now);
        await store.exclusive(async () => {
          await store.write(path2, buildProposalText({
            target: args.target,
            action: args.action ?? "create",
            pageText,
            now,
            rationale: args.reason,
            baseUpdated: snapshot.byId.get(args.target)?.updated
          }));
        });
        await store.appendLog(now, "proposal", `\u63D0\u6848\uFF1A${args.target}`, [args.reason ?? ""]);
        return { written: path2, mode: "propose", warnings: validation.warnings };
      }
      if (deps.writeMode !== "direct") {
        throw new ToolArgsError(["mode=direct \u88AB\u62D2\u7EDD\uFF1A\u63D2\u4EF6\u914D\u7F6E\u662F propose\uFF1B\u8981\u76F4\u5199\u8BF7\u5148\u5728\u9762\u677F\u91CC\u6539 writeMode\u3002"]);
      }
      const path = `${WIKI_LAYOUT.wikiDir}/${args.target}.md`;
      await store.exclusive(async () => {
        await store.write(path, pageText);
        const { snapshot: fresh } = await store.load();
        await store.write(WIKI_LAYOUT.indexPath, renderIndex(fresh, { updated: now }));
      });
      await store.appendLog(now, "write", `\u76F4\u5199\uFF1A${args.target}`, [args.reason ?? ""]);
      return { written: path, mode: "direct", warnings: validation.warnings };
    }
  }));
  ctx.tools.register(defineTool({
    name: "wiki_lint",
    description: "Run the whole-library audit. `fix: true` rebuilds index.md (the only auto-fixable rules).",
    parameters: {
      fix: { type: "boolean", description: "\u662F\u5426\u987A\u5E26\u4FEE\u590D\u53EF\u81EA\u52A8\u4FEE\u7684\u95EE\u9898\uFF08\u91CD\u5EFA\u7D22\u5F15\uFF09\u3002" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          error: { type: "integer", required: true },
          warn: { type: "integer", required: true },
          info: { type: "integer", required: true },
          fixed: { type: "integer", required: true },
          items: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                code: { type: "string", required: true },
                severity: { type: "string", required: true },
                page: { type: "string", required: true },
                message: { type: "string", required: true }
              }
            }
          }
        }
      },
      render: (_args, value) => TEXT([
        `error ${value.error} \xB7 warn ${value.warn} \xB7 info ${value.info}${value.fixed > 0 ? ` \xB7 \u5DF2\u4FEE ${value.fixed}` : ""}`,
        value.items.slice(0, 20).map((item) => `- [${item.severity}] ${item.code} \xB7 \`${item.page}\` ${item.message}`).join("\n"),
        value.items.length > 20 ? `\u2026\u8FD8\u6709 ${value.items.length - 20} \u6761\uFF08\u770B\u9762\u677F\u4F53\u68C0\u9875\uFF09` : ""
      ].filter(Boolean).join("\n"))
    },
    presentCall: () => ({ card: "generic", title: "\u4F53\u68C0", kind: "read" }),
    async execute(args) {
      const result = await actions.lint({ fix: args.fix === true });
      const detail = result.detail;
      return {
        error: detail.counts.error ?? 0,
        warn: detail.counts.warn ?? 0,
        info: detail.counts.info ?? 0,
        fixed: result.receipt.changed,
        items: detail.findings.map((item) => ({ code: item.code, severity: item.severity, page: item.page, message: item.message }))
      };
    }
  }));
  ctx.tools.register(defineTool({
    name: "wiki_bootstrap",
    description: "Create the library skeleton (0-inbox / 1-raw / 2-wiki / 3-review + WIKI.md + index + log). Idempotent: existing files are skipped.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          created: { type: "array", required: true, items: { type: "string" } },
          skipped: { type: "array", required: true, items: { type: "string" } }
        }
      },
      render: (_args, value) => TEXT(`\u5EFA\u5E93\u5B8C\u6210\uFF1A\u65B0\u5EFA ${value.created.length} \u4E2A\uFF0C\u8DF3\u8FC7 ${value.skipped.length} \u4E2A\u5DF2\u5B58\u5728\u6587\u4EF6\u3002`)
    },
    presentCall: () => ({ card: "generic", title: "\u521D\u59CB\u5316\u77E5\u8BC6\u5E93", kind: "edit" }),
    async execute() {
      const result = await actions.bootstrap();
      const detail = result.detail;
      return { created: detail.created, skipped: detail.skipped };
    }
  }));
  ctx.tools.register(defineTool({
    name: "wiki_action",
    description: [
      "Trigger one panel action by id (A01\u2013A19). Use it when a scheduled job tells you to run an action, or when the panel cannot reach the host.",
      "params is a JSON object string; pass only the fields that action accepts."
    ].join(" "),
    parameters: {
      action: { type: "string", required: true, description: "A01\u2026A19\u3002" },
      params: { type: "string", description: 'JSON \u5BF9\u8C61\u5B57\u7B26\u4E32\uFF0C\u4F8B\u5982 {"all":true}\u3002' }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          changed: { type: "integer", required: true },
          created: { type: "integer", required: true },
          removed: { type: "integer", required: true },
          notes: { type: "array", required: true, items: { type: "string" } },
          instruction: { type: "string", required: true }
        }
      },
      render: (_args, value) => TEXT([`\u6539\u52A8 ${value.changed} \xB7 \u65B0\u5EFA ${value.created} \xB7 \u5220\u9664 ${value.removed}`, value.notes.join("\n"), value.instruction].filter(Boolean).join("\n"))
    },
    presentCall: (args) => ({ card: "generic", title: `\u6267\u884C ${args.action}`, kind: "execute" }),
    async execute(args) {
      let params = {};
      if (args.params !== void 0 && args.params.trim() !== "") {
        try {
          params = JSON.parse(args.params);
        } catch {
          throw new ToolArgsError(["params \u4E0D\u662F\u5408\u6CD5 JSON"]);
        }
      }
      const result = await runAction(actions, args.action, params);
      return {
        changed: result.receipt.changed,
        created: result.receipt.created,
        removed: result.receipt.removed,
        notes: result.receipt.notes,
        instruction: result.instruction ?? ""
      };
    }
  }));
}
async function runAction(actions, action, params) {
  const text = (key) => String(params[key] ?? "");
  switch (action) {
    case "A01":
      return actions.note({ text: text("text"), title: params.title, domain: params.domain });
    case "A03":
      return actions.preprocess({ item: text("item") });
    case "A04":
      return actions.collect({
        urls: Array.isArray(params.urls) ? params.urls.map(String) : text("sources").split(",").filter((item) => item.trim() !== ""),
        topic: params.topic,
        maxItems: typeof params.maxItems === "number" ? params.maxItems : void 0
      });
    case "A05":
      return actions.confirm({ items: params.items, all: params.all === true, byHuman: false });
    case "A06":
      return actions.retract({ item: text("item") });
    case "A07":
      return actions.compile({ items: params.items, all: params.all === true });
    case "A08":
      return actions.gap({ query: text("query") });
    case "A09":
      return actions.merge({ paths: params.paths, all: params.all === true, dryRun: params.dryRun === true });
    case "A10":
      return actions.expireProposals({ keepDays: typeof params.keepDays === "number" ? params.keepDays : void 0, dryRun: params.dryRun === true });
    case "A11":
      return actions.lint({ fix: params.fix === true });
    case "A12":
      return actions.dedupe({
        threshold: typeof params.threshold === "number" ? params.threshold : void 0,
        limit: typeof params.limit === "number" ? params.limit : void 0,
        dryRun: params.dryRun === true
      });
    case "A13":
      return actions.contradict({
        domain: params.domain,
        maxPages: typeof params.maxPages === "number" ? params.maxPages : void 0
      });
    case "A14":
      return actions.stale({ days: typeof params.days === "number" ? params.days : void 0 });
    case "A15":
      return actions.reindex();
    case "A16":
      return actions.bootstrap();
    case "A17":
      return actions.rollback({ commit: params.commit });
    case "A18":
      return actions.cleanSafe({ dryRun: params.dryRun === true });
    case "A19":
      return actions.cleanDeep({ items: params.items, dryRun: params.dryRun === true });
    default:
      throw new ToolArgsError([`\u672A\u77E5\u52A8\u4F5C ${action}\uFF1A\u53EF\u7528 A01\u2013A19`]);
  }
}

// host/store.ts
import { mkdir as mkdir2, readdir as readdir3, readFile as readFile3, realpath, rename, rm as rm2, stat as stat3, writeFile as writeFile2, copyFile } from "node:fs/promises";
import { dirname as dirname2, isAbsolute, join as join6, relative as relative2, basename as basename4 } from "node:path";
import { randomBytes as randomBytes2 } from "node:crypto";
var CACHE_TTL_MS = 2e3;
var WikiStore = class {
  currentPath;
  cache;
  queue = Promise.resolve();
  constructor(libraryPath) {
    this.currentPath = libraryPath;
  }
  /** 当前库根。切换知识库时就地重绑，所有下游（Actions / JobsStore / tools）跟着走。 */
  get libraryPath() {
    return this.currentPath;
  }
  /**
   * 换一个库：同一个 store 实例继续服役，清掉按旧库算出来的缓存。
   * 面板的"选择知识库"就是在空间里挑一个文件夹后调这里。
   */
  rebase(libraryPath) {
    this.currentPath = libraryPath;
    this.cache = void 0;
  }
  /** 把"库内相对路径"与"库内绝对路径"统一成相对路径；库外绝对路径原样保留，由调用处报错。 */
  normalize(relPath) {
    const withoutDot = relPath.replace(/^\.\//, "");
    if (withoutDot === this.libraryPath) return ".";
    if (withoutDot.startsWith(`${this.libraryPath}/`)) return withoutDot.slice(this.libraryPath.length + 1);
    return withoutDot;
  }
  /** 库内相对路径 → 绝对路径；拒绝越界。 */
  abs(relPath) {
    const normalized = this.normalize(relPath);
    const absolute = normalized.startsWith("/") ? normalized : join6(this.libraryPath, normalized);
    const outside = relative2(this.libraryPath, absolute);
    if (outside.startsWith("..")) throw new Error(`\u8DEF\u5F84\u8D8A\u754C\uFF1A${relPath}`);
    return absolute;
  }
  /** 库根是否已存在（面板用它在建库前显示"未初始化"）。 */
  async rootExists() {
    try {
      return (await stat3(this.libraryPath)).isDirectory();
    } catch {
      return false;
    }
  }
  /** 库根必须存在且是目录；不存在就报错，建库走 bootstrap()。 */
  async ensureLibrary() {
    try {
      const info = await stat3(this.libraryPath);
      if (!info.isDirectory()) throw new Error(`libraryPath \u4E0D\u662F\u76EE\u5F55\uFF1A${this.libraryPath}`);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`libraryPath \u4E0D\u5B58\u5728\uFF1A${this.libraryPath}\uFF08\u5148\u5728\u9762\u677F\u91CC\u521D\u59CB\u5316\u77E5\u8BC6\u5E93\uFF09`);
      }
      throw error;
    }
  }
  /** 串行化所有写动作：进程内单写者，避免两个按钮同时点导致半写状态。 */
  async exclusive(task) {
    const previous = this.queue;
    let release = () => {
    };
    this.queue = new Promise((resolve2) => {
      release = resolve2;
    });
    await previous.catch(() => {
    });
    try {
      return await task();
    } finally {
      release();
    }
  }
  /**
   * 四个阶段目录的 mtime 指纹。
   * 缓存不能只按时间失效：用户可能在 Obsidian 里直接改文件，2 秒窗口内的旧快照
   * 会让"刚写完提案就点合并"读到空提案列表。
   *
   * 关键点：**只看顶层目录 mtime 是不够的**。POSIX 语义下，在 `2-wiki/concepts/`
   * 里新建/删除文件，只改 `concepts/` 的 mtime，`2-wiki/` 自己的 mtime 不变。
   * 所以这里递归走一层子目录，把每个子目录的 mtime 也计入指纹；否则
   * "刚写完提案 → 立刻点合并"会读到 2 秒窗口内的旧快照，合并出空列表。
   */
  async signature() {
    const parts = [];
    for (const directory of [WIKI_LAYOUT.inboxNotes, WIKI_LAYOUT.rawDir, WIKI_LAYOUT.wikiDir, WIKI_LAYOUT.proposalDir]) {
      const absolute = this.abs(directory);
      try {
        const info = await stat3(absolute);
        parts.push(`${info.mtimeMs}`);
      } catch {
        parts.push("-");
        continue;
      }
      try {
        const children = await readdir3(absolute, { withFileTypes: true });
        const dirs = children.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));
        for (const child of dirs.sort((left, right) => left.name.localeCompare(right.name))) {
          try {
            const info = await stat3(join6(absolute, child.name));
            parts.push(`${child.name}:${info.mtimeMs}`);
          } catch {
            parts.push(`${child.name}:-`);
          }
        }
      } catch {
        parts.push("!");
      }
    }
    return parts.join("|");
  }
  async load() {
    if (this.cache !== void 0 && Date.now() - this.cache.at < CACHE_TTL_MS) {
      if (await this.signature() === this.cache.sig) return this.cache;
    }
    await this.ensureLibrary();
    const wikiFiles = await listMarkdown(join6(this.libraryPath, WIKI_LAYOUT.wikiDir));
    const pages = [];
    for (const file of wikiFiles) {
      const rel = relative2(this.libraryPath, file).split("\\").join("/");
      pages.push(parsePage(rel, await readFile3(file, "utf8"), this.libraryPath));
    }
    const rawFiles = await listMarkdown(join6(this.libraryPath, WIKI_LAYOUT.rawDir), false);
    const rawPages = [];
    for (const file of rawFiles) {
      const rel = relative2(this.libraryPath, file).split("\\").join("/");
      rawPages.push(parsePage(rel, await readFile3(file, "utf8"), this.libraryPath));
    }
    const proposalFiles = await listMarkdown(join6(this.libraryPath, WIKI_LAYOUT.proposalDir), false).catch(() => []);
    const proposals = [];
    for (const file of proposalFiles) {
      const rel = relative2(this.libraryPath, file).split("\\").join("/");
      const parsed = parseProposal(rel, await readFile3(file, "utf8"));
      if (parsed !== null) proposals.push(parsed);
    }
    const indexText = await this.readOptional(WIKI_LAYOUT.indexPath);
    const logText = await this.readOptional(WIKI_LAYOUT.logPath) ?? "";
    const jobsRaw = await this.readOptional(WIKI_LAYOUT.jobsFile) ?? "";
    const loaded = {
      snapshot: buildSnapshot(pages, rawPages),
      indexText,
      logText,
      proposals,
      jobsRaw
    };
    this.cache = { ...loaded, at: Date.now(), sig: await this.signature() };
    return loaded;
  }
  invalidate() {
    this.cache = void 0;
  }
  async read(relPath) {
    return readFile3(this.abs(relPath), "utf8");
  }
  async readOptional(relPath) {
    try {
      return await readFile3(this.abs(relPath), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return void 0;
      throw error;
    }
  }
  async exists(relPath) {
    try {
      await stat3(this.abs(relPath));
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }
  /** 写一个文件；白名单之外一律拒绝。先写临时文件再 rename，避免半写。 */
  async write(relPath, text) {
    this.assertWritable(relPath);
    await this.assertInsideReal(relPath);
    const absolute = this.abs(relPath);
    await mkdir2(dirname2(absolute), { recursive: true });
    const temp = `${absolute}.tmp-${randomBytes2(4).toString("hex")}`;
    await writeFile2(temp, text, "utf8");
    await rename(temp, absolute);
    this.invalidate();
  }
  /** 删除一个文件；默认先丢进回收站，`hard` 才真删。 */
  async remove(relPath, options = {}) {
    this.assertWritable(relPath);
    await this.assertInsideReal(relPath);
    const absolute = this.abs(relPath);
    if (options.hard === true) {
      await rm2(absolute, { force: true });
      this.invalidate();
      return;
    }
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
    const target = join6(this.abs(WIKI_LAYOUT.trashDir), `${stamp}-${basename4(relPath)}`);
    await mkdir2(dirname2(target), { recursive: true });
    await rename(absolute, target);
    this.invalidate();
  }
  /** 移动/改名（同一库内）。 */
  async move(fromRel, toRel) {
    this.assertWritable(fromRel);
    this.assertWritable(toRel);
    await this.assertInsideReal(fromRel);
    await this.assertInsideReal(toRel);
    const target = this.abs(toRel);
    await mkdir2(dirname2(target), { recursive: true });
    await rename(this.abs(fromRel), target);
    this.invalidate();
  }
  /** 备份一个文件到 3-review/.backup，用于合并前留底与回滚。 */
  async backup(relPath) {
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
    const target = `${WIKI_LAYOUT.backupDir}/${stamp}-${relPath.replace(/\//g, "_")}`;
    const absolute = this.abs(target);
    await mkdir2(dirname2(absolute), { recursive: true });
    await copyFile(this.abs(relPath), absolute);
    return target;
  }
  /**
   * 备份整个目录（逐文件复制，保留相对结构）。
   * 回滚要"先把当前状态留底"，这一步不能对一个目录调用 copyFile。
   */
  async backupTree(relDir) {
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
    const target = `${WIKI_LAYOUT.backupDir}/${stamp}-${relDir.replace(/\//g, "_")}`;
    const files = await this.listFiles(relDir);
    for (const file of files) {
      const inner = relative2(relDir, file);
      const absolute = this.abs(`${target}/${inner}`);
      await mkdir2(dirname2(absolute), { recursive: true });
      await copyFile(this.abs(file), absolute);
    }
    return target;
  }
  /** 只在四个阶段目录里允许写。判据是路径前缀，且不许出现 ..。 */
  /**
   * 白名单校验（纯字符串层）。
   *
   * 这一层只挡 `../` 与白名单前缀，**挡不住符号链接**：库里若有一个
   * `0-inbox/notes/evil -> /tmp/outside` 的软链，路径字符串仍然"合法"，
   * 实际却写到库外。真正的边界由 `assertInsideReal()` 用 realpath 兜住。
   */
  assertWritable(relPath) {
    const normalized = this.normalize(relPath);
    if (normalized.startsWith("/") || normalized.includes("..")) {
      throw new Error(`\u62D2\u7EDD\u5199\u5165 ${relPath}\uFF1A\u8DEF\u5F84\u5FC5\u987B\u76F8\u5BF9\u5E93\u6839\u4E14\u4E0D\u542B ..`);
    }
    if (!WRITABLE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      throw new Error(`\u62D2\u7EDD\u5199\u5165 ${relPath}\uFF1A\u53EA\u5141\u8BB8 ${WRITABLE_PREFIXES.join(" / ")}`);
    }
  }
  /**
   * 真实路径边界：沿符号链接解析后，目标必须仍在库内。
   *
   * 目标文件可能还不存在，所以从"最近的已存在祖先"开始 realpath，
   * 再把剩下的相对段接回去——这样新建深层目录也能正确判定。
   */
  async assertInsideReal(relPath) {
    const absolute = this.abs(relPath);
    const realRoot = await realpath(this.libraryPath).catch(() => this.libraryPath);
    let probe2 = absolute;
    const tail = [];
    for (; ; ) {
      const resolved = await realpath(probe2).catch(() => void 0);
      if (resolved !== void 0) {
        const finalPath = tail.length === 0 ? resolved : join6(resolved, ...tail);
        const outside = relative2(realRoot, finalPath);
        if (outside === "" || !outside.startsWith("..") && !isAbsolute(outside)) return;
        throw new Error(`\u62D2\u7EDD\u8BBF\u95EE ${relPath}\uFF1A\u7B26\u53F7\u94FE\u63A5\u6307\u5411\u5E93\u5916\uFF08${finalPath}\uFF09`);
      }
      const parent = dirname2(probe2);
      if (parent === probe2) {
        return;
      }
      tail.unshift(basename4(probe2));
      probe2 = parent;
    }
  }
  /** 白名单外仍必须写的生成物（WIKI.md、.gitignore）：只给建库用，别处不要调。 */
  async writeRaw(relPath, text) {
    const absolute = this.abs(relPath);
    await mkdir2(dirname2(absolute), { recursive: true });
    const temp = `${absolute}.tmp-${randomBytes2(4).toString("hex")}`;
    await writeFile2(temp, text, "utf8");
    await rename(temp, absolute);
    this.invalidate();
  }
  /** 追加一条 log；log 不存在时自动补头。 */
  async appendLog(now, operation, summary, details = []) {
    const current = await this.readOptional(WIKI_LAYOUT.logPath) ?? "";
    const entry = logEntry({ now, operation, summary, details });
    await this.write(WIKI_LAYOUT.logPath, appendLog(current, entry));
  }
  /** 建骨架；已存在的文件跳过。 */
  async bootstrap(now) {
    await mkdir2(this.libraryPath, { recursive: true });
    for (const directory of WIKI_DIRECTORIES) {
      await mkdir2(join6(this.libraryPath, directory), { recursive: true });
    }
    const created = [];
    const skipped = [];
    for (const file of bootstrapFiles(now)) {
      if (await this.exists(file.path)) {
        skipped.push(file.path);
        continue;
      }
      await this.writeRaw(file.path, file.text);
      created.push(file.path);
    }
    this.invalidate();
    return { created, skipped };
  }
  /** 目录占用：附件、切片、备份、回收站四个大头。 */
  async occupancy() {
    const [attachments, parts, backup, trash] = await Promise.all([
      dirSize(this.abs(WIKI_LAYOUT.attachments)),
      dirSize(this.abs(WIKI_LAYOUT.inboxParts)),
      dirSize(this.abs(WIKI_LAYOUT.backupDir)),
      dirSize(this.abs(WIKI_LAYOUT.trashDir))
    ]);
    return { attachments, parts, backup, trash, total: attachments + parts + backup + trash };
  }
  /** 列出某个目录下的文件（库内相对路径）。 */
  async listFiles(relDir, recursive = true) {
    const files = await listMarkdown(this.abs(relDir), recursive);
    return files.map((file) => relative2(this.libraryPath, file).split("\\").join("/"));
  }
  /** 列出某个目录下的全部文件（不限扩展名）。 */
  async listAny(relDir, recursive = false) {
    const files = await listAll(this.abs(relDir), recursive);
    return files.map((file) => relative2(this.libraryPath, file).split("\\").join("/"));
  }
};
async function dirSize(directory) {
  let total = 0;
  let entries;
  try {
    entries = await readdir3(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join6(directory, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
      continue;
    }
    if (entry.isFile()) {
      try {
        total += (await stat3(full)).size;
      } catch {
      }
    }
  }
  return total;
}
async function listMarkdown(directory, recursive = true) {
  const result = [];
  let entries;
  try {
    entries = await readdir3(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return result;
    throw error;
  }
  for (const entry of entries) {
    const full = join6(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      if (recursive) result.push(...await listMarkdown(full, true));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) result.push(full);
  }
  return result;
}
async function listAll(directory, recursive) {
  const result = [];
  let entries;
  try {
    entries = await readdir3(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return result;
    throw error;
  }
  for (const entry of entries) {
    const full = join6(directory, entry.name);
    if (entry.isDirectory()) {
      if (recursive) result.push(...await listAll(full, true));
      continue;
    }
    if (entry.isFile()) result.push(full);
  }
  return result;
}

// host/settings.ts
import { mkdir as mkdir3, rename as rename2, writeFile as writeFile3 } from "node:fs/promises";
import { readFileSync as readFileSync3 } from "node:fs";
import { dirname as dirname3, join as join7 } from "node:path";
var SETTINGS_FILE = "llm-wiki.settings.json";
function settingsFilePath(profileDir) {
  return join7(profileDir, SETTINGS_FILE);
}
function readSettingsSync(profileDir) {
  if (profileDir === "") return {};
  try {
    const parsed = JSON.parse(readFileSync3(settingsFilePath(profileDir), "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}
async function writeSettings(profileDir, patch) {
  const file = settingsFilePath(profileDir);
  const current = readSettingsSync(profileDir);
  const merged = { ...current, ...patch };
  if (!("_comment" in merged)) {
    merged["_comment"] = "dsh-plugin-llm-wiki \u7684\u8BBE\u7F6E\u6587\u4EF6\uFF1A\u7531\u300C\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 LLM Wiki\u300D\u5199\u5165\uFF0C\u8986\u76D6 profile \u914D\u7F6E\u91CC\u7684\u540C\u540D\u9879\u3002\u624B\u5DE5\u6539\u4E5F\u6709\u6548\uFF08\u952E\u540D\u4E0E\u63D2\u4EF6 Config \u4E00\u81F4\uFF09\u3002";
  }
  const text = `${JSON.stringify(merged, null, 2)}
`;
  await mkdir3(dirname3(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile3(tmp, text, "utf8");
  await rename2(tmp, file);
  return { file, merged };
}

// host/index.ts
var name = "llm-wiki";
var inject = ["tools"];
var Config = z.object({
  spacePath: z.string().default(""),
  libraryPath: z.string().default(""),
  libraryName: z.string().default("brain"),
  writeMode: z.union(["propose", "direct"]).default("propose"),
  maxCandidates: z.number().step(1).min(1).max(20).default(8),
  gitEnabled: z.boolean().default(false),
  gitAutoCommit: z.boolean().default(true),
  audioProvider: z.union(["none", "whisper", "api"]).default("none"),
  audioMaxMinutes: z.number().step(1).min(5).max(120).default(30),
  audioChunkMinutes: z.number().step(1).min(2).max(30).default(10),
  debounceMs: z.number().step(100).min(500).max(5e3).default(1500),
  watchLibrary: z.boolean().default(true),
  vaultName: z.string().default("")
});
function resolveProfile(ctx) {
  const service = ctx.get("profileContext");
  const dir = (service?.dir ?? process.env.DSH_PROFILE_DIR ?? "").trim();
  if (dir === "") return { dir: "", patchPath: "" };
  const patchPath = (service?.patchPath ?? "").trim() || join8(dir, "cordis.patch.yml");
  return { dir, patchPath };
}
function profileConfigFile(patchPath) {
  return patchPath !== "" && existsSync3(patchPath) ? patchPath : "";
}
function mergeLiveConfig(base, profileDir, log) {
  if (profileDir === "") return { ...base };
  const stored = readSettingsSync(profileDir);
  if (Object.keys(stored).length === 0) return { ...base };
  try {
    const clean = sanitizeConfigPatch(stored);
    return { ...base, ...clean };
  } catch (error) {
    log?.(`\u8BBE\u7F6E\u6587\u4EF6\u91CC\u6709\u4E0D\u5408\u6CD5\u7684\u503C\uFF0C\u5DF2\u5FFD\u7565\uFF1A${error instanceof Error ? error.message : String(error)}`);
    return { ...base };
  }
}
function apply(ctx, config) {
  const profile = resolveProfile(ctx);
  const profileDir = profile.dir;
  const settingsFile = profileDir === "" ? "" : settingsFilePath(profileDir);
  const log = (message) => {
    ctx.logger?.("llm-wiki").warn(message);
  };
  const live = mergeLiveConfig(config, profileDir, log);
  let spacePath = live.spacePath.trim();
  let configured = live.libraryPath.trim();
  let folder = spacePath === "" ? "" : readActive(spacePath) ?? (configured === "" ? live.libraryName : basename5(configured));
  let libraryPath = spacePath === "" ? configured : join8(spacePath, folder);
  if (libraryPath === "") {
    ctx.logger?.("llm-wiki").warn("\u65E2\u6CA1\u914D spacePath \u4E5F\u6CA1\u914D libraryPath\uFF1A\u63D2\u4EF6\u4E0D\u6CE8\u518C\u4EFB\u4F55\u5DE5\u5177");
    return;
  }
  let libraryName = basename5(libraryPath);
  const store = new WikiStore(libraryPath);
  let cliProbe;
  const jobs = new JobsStore(store, libraryName);
  const scheduleOf = () => ctx.get("schedule");
  const deferToAgent = async (instruction, title) => {
    const schedule = scheduleOf();
    if (schedule === void 0 || typeof schedule.run !== "function") return false;
    try {
      const created = await schedule.create({
        title: `[wiki] ${libraryName} \xB7 ${title}`,
        prompt: [
          `owner: llm-wiki; library: ${store.libraryPath}`,
          `\u8FD9\u662F\u4E00\u6B21\u6027\u4EFB\u52A1\uFF1A\u5B8C\u6210\u540E\u4E0D\u9700\u8981\u4FDD\u7559\u3002`,
          instruction
        ].join("\n"),
        timing: { kind: "at", at: new Date(Date.now() + 5e3).toISOString() },
        target: { kind: "new_once" }
      });
      const outcome = await schedule.run({ id: created.id });
      const pending = typeof outcome === "object" && outcome !== null && outcome.code === "schedule_execution_pending";
      if (!pending) await schedule.edit({ id: created.id, action: "delete" });
      return true;
    } catch (error) {
      ctx.logger?.("llm-wiki").warn(`\u4EA4\u7ED9 agent \u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
  const actionContext = {
    store,
    now: () => (/* @__PURE__ */ new Date()).toISOString(),
    deferToAgent,
    gitEnabled: live.gitEnabled,
    gitAutoCommit: live.gitAutoCommit,
    audioProvider: live.audioProvider,
    audioMaxMinutes: live.audioMaxMinutes,
    audioChunkMinutes: live.audioChunkMinutes
  };
  const actions = new Actions(actionContext);
  const toolDeps = {
    store,
    actions,
    writeMode: live.writeMode,
    maxCandidates: live.maxCandidates
  };
  registerWikiTools(ctx, toolDeps);
  let watchers = [];
  let debounceTimer;
  let rebuilding = false;
  const stopWatchers = () => {
    if (debounceTimer !== void 0) {
      clearTimeout(debounceTimer);
      debounceTimer = void 0;
    }
    for (const watcher of watchers) watcher.close();
    watchers = [];
  };
  const startWatchers = () => {
    if (!live.watchLibrary) {
      stopWatchers();
      return;
    }
    const trigger = () => {
      if (debounceTimer !== void 0) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (rebuilding) return;
        rebuilding = true;
        void actions.reindex().catch((error) => {
          if (!(error instanceof ActionError)) {
            ctx.logger?.("llm-wiki").warn(`\u81EA\u52A8\u91CD\u5EFA\u7D22\u5F15\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
          }
        }).finally(() => {
          rebuilding = false;
        });
      }, live.debounceMs);
    };
    for (const directory of [WIKI_LAYOUT.wikiDir, WIKI_LAYOUT.proposalDir]) {
      try {
        watchers.push(watch(`${store.libraryPath}/${directory}`, { recursive: true }, () => {
          trigger();
        }));
      } catch (error) {
        ctx.logger?.("llm-wiki").info(`\u76D1\u542C ${directory} \u5931\u8D25\uFF08\u5E93\u53EF\u80FD\u8FD8\u6CA1\u5EFA\uFF09\uFF1A${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  startWatchers();
  ctx.effect(() => () => {
    stopWatchers();
  }, "llm-wiki: library watcher");
  const applySettings = async (patch, deps) => {
    Object.assign(live, patch);
    actionContext.gitEnabled = live.gitEnabled;
    actionContext.gitAutoCommit = live.gitAutoCommit;
    actionContext.audioProvider = live.audioProvider;
    actionContext.audioMaxMinutes = live.audioMaxMinutes;
    actionContext.audioChunkMinutes = live.audioChunkMinutes;
    toolDeps.writeMode = live.writeMode;
    toolDeps.maxCandidates = live.maxCandidates;
    deps.gitEnabled = live.gitEnabled;
    deps.audioProvider = live.audioProvider;
    let pathsChanged = false;
    const nextSpace = live.spacePath.trim();
    const nextConfigured = live.libraryPath.trim();
    if (nextSpace !== spacePath || nextConfigured !== configured) {
      spacePath = nextSpace;
      configured = nextConfigured;
      const nextFolder = spacePath === "" ? "" : readActive(spacePath) ?? (configured === "" ? live.libraryName : basename5(configured));
      const nextLibrary = spacePath === "" ? configured : join8(spacePath, nextFolder);
      if (nextLibrary !== "" && nextLibrary !== store.libraryPath) {
        stopWatchers();
        store.rebase(nextLibrary);
        libraryName = basename5(nextLibrary);
        folder = nextFolder;
        jobs.rename(libraryName);
        if (spacePath !== "") {
          await writeActive(spacePath, libraryName).catch((error) => {
            ctx.logger?.("llm-wiki").warn(`\u5199\u5165\u7A7A\u95F4\u70B9\u6587\u4EF6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
          });
        }
        startWatchers();
        pathsChanged = true;
      }
    }
    deps.libraryName = libraryName;
    deps.vaultName = vaultNameOf(store.libraryPath, live.vaultName);
    deps.space.path = spacePath;
    deps.space.active = folder;
    return { pathsChanged };
  };
  ctx.inject(["webServer"], (scoped) => {
    const deps = {
      store,
      actions,
      jobs,
      libraryName,
      gitEnabled: live.gitEnabled,
      audioProvider: live.audioProvider,
      vaultName: vaultNameOf(libraryPath, live.vaultName),
      // 惰性探测：apply 是同步的，第一次打开面板时才去问 obsidian-cli 在不在。
      obsidianCli: () => cliProbe ??= detectCli(),
      obsidianAppAvailable: () => appInstalled(),
      schedule: scheduleOf,
      // 一句话建任务走这条：把自然语言交给 agent，由它翻成 rrule 再建。
      deferToAgent,
      // profile 里这份配置的落点，设置页拿它证明"改动真的写到磁盘上了"。
      configPath: profileConfigFile(profile.patchPath),
      settingsPath: settingsFile,
      readConfig: () => ({
        libraryName,
        writeMode: live.writeMode,
        maxCandidates: live.maxCandidates,
        gitEnabled: live.gitEnabled,
        gitAutoCommit: live.gitAutoCommit,
        audioProvider: live.audioProvider,
        audioMaxMinutes: live.audioMaxMinutes,
        audioChunkMinutes: live.audioChunkMinutes,
        debounceMs: live.debounceMs,
        watchLibrary: live.watchLibrary,
        vaultName: live.vaultName,
        // 路径两项可编辑：给的是**配置里的原始值**，不是解析后的结果，
        // 否则用户一保存就会把"解析出来的当前库"写成配置。
        spacePath: live.spacePath,
        libraryPath: live.libraryPath,
        // 解析后的现状，只读展示用。
        resolvedLibraryPath: store.libraryPath,
        activeLibrary: libraryName
      }),
      /**
       * 打开知识库：注册 vault → 唤起 Obsidian → 兜底。
       * 传的是**当前库**的绝对路径，不是空间：一个库一个 vault。
       */
      openInObsidian: (relPath) => openInObsidian({
        vaultPath: store.libraryPath,
        vaultName: deps.vaultName,
        // 原始配置值（可能是空串）：判断"要不要单独开一个 vault"只能看它。
        explicitVaultName: live.vaultName,
        relPath
      }),
      /**
       * 写回配置，两级落点：
       *
       * 1. `configEditor`（DSH 正规通道）：写 profile 的 cordis.patch.yml，Loader 立刻重载。
       *    插件以 `insert:` 形式装进 profile 时这条路会被拒——那就走第 2 级。
       * 2. 插件自有的 `llm-wiki.settings.json`（同目录、同一块磁盘）：写完当场生效，
       *    不用重启；启动时它覆盖 DSH Config。
       *
       * 两级都不成时如实返回 `persisted: false`，不假装存住了。
       */
      writeConfig: async (patch) => {
        const entry = ctx.fiber?.entry;
        const editor = ctx.get("configEditor");
        if (settingsFile === "") {
          return { persisted: false, error: "\u6CA1\u6709\u53EF\u5199\u7684 profile \u76EE\u5F55\uFF1A\u8BBE\u7F6E\u65E0\u5904\u843D\u76D8\uFF08DSH \u6CA1\u63D0\u4F9B profileContext\uFF09" };
        }
        let written;
        try {
          written = await writeSettings(profileDir, patch);
        } catch (error) {
          return { persisted: false, error: `\u5199\u8BBE\u7F6E\u6587\u4EF6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}` };
        }
        const outcome = await applySettings(patch, deps);
        let profileSynced = false;
        let profileError = "";
        if (entry !== void 0 && editor !== void 0) {
          try {
            await editor.edit(entry, (current) => ({ ...current, ...patch }));
            profileSynced = true;
          } catch (error) {
            profileError = error instanceof Error ? error.message : String(error);
          }
        } else {
          profileError = entry === void 0 ? "\u62FF\u4E0D\u5230 profile \u91CC\u7684\u63D2\u4EF6\u6761\u76EE" : "DSH \u6CA1\u6709 configEditor \u670D\u52A1";
        }
        return {
          persisted: true,
          via: "settings",
          file: written.file,
          applied: true,
          pathsChanged: outcome.pathsChanged,
          profileSynced,
          note: profileSynced ? "\u540C\u4E00\u4EFD\u503C\u4E5F\u5199\u8FDB\u4E86 profile \u914D\u7F6E" : `profile \u914D\u7F6E\u5C42\u6CA1\u5199\u8FDB\u53BB\uFF08${profileError}\uFF09\uFF1A\u672C\u6761\u8BBE\u7F6E\u4EE5\u63D2\u4EF6\u8BBE\u7F6E\u6587\u4EF6\u4E3A\u51C6`
        };
      },
      space: {
        path: spacePath,
        active: folder,
        list: async () => spacePath === "" ? [] : listLibraries(spacePath),
        init: async (name2) => {
          if (spacePath === "") throw new ActionError("E_NO_SPACE", "\u8FD8\u6CA1\u914D\u77E5\u8BC6\u7A7A\u95F4\uFF1A\u8BBE\u7F6E\u91CC\u586B\u4E00\u4E2A\u76EE\u5F55");
          const result = await initLibrary(spacePath, name2, (/* @__PURE__ */ new Date()).toISOString());
          return result.library;
        },
        /**
         * 切库：同一进程内直接重绑 store，不重载插件。
         * 名字、vault 名、任务归属一起换；DSH 里的任务本来就带库路径，互不干扰。
         */
        activate: async (name2) => {
          if (spacePath === "") throw new ActionError("E_NO_SPACE", "\u8FD8\u6CA1\u914D\u77E5\u8BC6\u7A7A\u95F4\uFF1A\u8BBE\u7F6E\u91CC\u586B\u4E00\u4E2A\u76EE\u5F55");
          const list = await listLibraries(spacePath);
          const target = list.find((item) => item.name === name2);
          if (target === void 0) throw new ActionError("E_NOT_FOUND", `\u7A7A\u95F4\u91CC\u6CA1\u6709\u5E93 ${name2}`);
          stopWatchers();
          store.rebase(target.path);
          libraryName = target.name;
          jobs.rename(target.name);
          deps.libraryName = target.name;
          deps.vaultName = vaultNameOf(target.path, live.vaultName);
          startWatchers();
          await writeActive(spacePath, target.name);
          return target;
        }
      }
    };
    ctx.effect(
      () => registerRpc(scoped, deps),
      "llm-wiki: http routes"
    );
  });
  ctx.effect(() => {
    void (async () => {
      if (spacePath !== "" && readActive(spacePath) !== libraryName) {
        try {
          await writeActive(spacePath, libraryName);
        } catch (error) {
          ctx.logger?.("llm-wiki").warn(`\u5199\u5165\u7A7A\u95F4\u70B9\u6587\u4EF6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const schedule = scheduleOf();
      if (schedule === void 0) return;
      try {
        const file = await jobs.load();
        const result = await reconcile(schedule, file, store.libraryPath, libraryName);
        if (result.changed) {
          await jobs.save(file);
          ctx.logger?.("llm-wiki").info(`\u4EFB\u52A1\u5BF9\u8D26\uFF1A\u5EFA ${result.created.length} \u5220 ${result.deleted.length} \u5173\u95ED ${result.disabled.length}`);
        }
      } catch (error) {
        ctx.logger?.("llm-wiki").warn(`\u4EFB\u52A1\u5BF9\u8D26\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      }
    })();
    return () => {
    };
  }, "llm-wiki: task reconcile");
}
export {
  Config,
  apply,
  inject,
  name
};

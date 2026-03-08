import { type Config, type Schema, Tag } from "@markdoc/markdoc";

/* ── Custom tag schemas ───────────────────────────────────────────────────── */

const callout: Schema = {
  render: "Callout",
  selfClosing: false,
  attributes: {
    type: {
      type: String,
      default: "note",
      matches: ["note", "tip", "warn"],
    },
  },
};

const codeblock: Schema = {
  render: "CodeBlock",
  selfClosing: false,
  attributes: {
    language: {
      type: String,
      default: "bash",
    },
  },
  transform(node, config) {
    // Collect raw text children, trimming outer whitespace
    const raw = node.children
      .map((c) => {
        if (typeof c === "string") return c;
        if (c.type === "text" && c.attributes?.content) return c.attributes.content as string;
        return "";
      })
      .join("");
    const trimmed = raw.replace(/^\n/, "").replace(/\n$/, "");
    return new Tag("CodeBlock", { code: trimmed, language: node.attributes.language ?? "bash" }, []);
  },
};

const doctable: Schema = {
  render: "DocTable",
  selfClosing: false,
  attributes: {
    headers: { type: Array },
    rows: { type: Array },
  },
  transform(node, _config) {
    return new Tag(
      "DocTable",
      { headers: node.attributes.headers, rows: node.attributes.rows },
      [],
    );
  },
};

/* ── Node overrides ───────────────────────────────────────────────────────── */

const heading: Schema = {
  render: "Heading",
  children: ["inline"],
  attributes: {
    level: { type: Number, required: true },
  },
  transform(node, config) {
    const children = node.transformChildren(config);
    return new Tag("Heading", { level: node.attributes.level }, children);
  },
};

const paragraph: Schema = {
  render: "Paragraph",
  children: ["inline"],
};

const fence: Schema = {
  render: "CodeBlock",
  attributes: {
    language: { type: String },
    content: { type: String },
  },
  transform(node, _config) {
    return new Tag(
      "CodeBlock",
      { code: (node.attributes.content as string ?? "").replace(/\n$/, ""), language: node.attributes.language ?? "text" },
      [],
    );
  },
};

const code: Schema = {
  render: "InlineCode",
  attributes: {
    content: { type: String },
  },
};

/* ── Export config ─────────────────────────────────────────────────────────── */

export const markdocConfig: Config = {
  tags: {
    callout,
    codeblock,
    doctable,
  },
  nodes: {
    heading,
    paragraph,
    fence,
    code,
  },
};

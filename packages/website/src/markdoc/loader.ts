import Markdoc, { type RenderableTreeNode } from "@markdoc/markdoc";
import yaml from "yaml";
import { markdocConfig } from "./schema.ts";

export interface DocFrontmatter {
  id: string;
  title: string;
  group: string;
}

export interface ParsedDoc {
  frontmatter: DocFrontmatter;
  content: RenderableTreeNode;
}

/**
 * Parse a raw markdown string with YAML frontmatter into Markdoc render tree.
 */
export function parseDoc(raw: string): ParsedDoc {
  // Split frontmatter
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Missing YAML frontmatter in doc file");
  }

  const frontmatter = yaml.parse(match[1]) as DocFrontmatter;
  const body = match[2];

  const ast = Markdoc.parse(body);
  const content = Markdoc.transform(ast, markdocConfig);

  return { frontmatter, content };
}

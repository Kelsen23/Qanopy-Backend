import { createHash } from "node:crypto";
import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

type KnowledgeContentType = "CODE" | "TABLE" | "LIST" | "WARNING" | "PROSE";

type ExtractedLink = { text: string; url: string };

type ExtractedBlock = {
  type: KnowledgeContentType;
  text: string;
  headingPath: string[];
  links: ExtractedLink[];
  language?: string;
};

const extractKnowledgeContent = (
  html: string,
  url: string,
  contentSelectors: string[],
  removeSelectors: string[],
) => {
  const $ = load(html);
  removeUnwantedElements($, removeSelectors);

  const contentRoot = selectContentRoot($, contentSelectors);
  const title = getPageTitle($, contentRoot, url);
  const blocks = extractContentBlocks($, contentRoot, url);
  const plainText = blocks.map(({ text }) => text).join("\n\n");
  const contentHash = hashContent(title, blocks);

  return {
    title,
    blocks,
    plainText,
    contentHash,
    canonicalUrl: getCanonicalUrl($, url),
  };
};

const removeUnwantedElements = ($: CheerioAPI, selectors: string[]) => {
  for (const selector of selectors) {
    try {
      $(selector).remove();
    } catch {
      continue;
    }
  }
};

const selectContentRoot = (
  $: CheerioAPI,
  selectors: string[],
): Cheerio<AnyNode> => {
  for (const selector of selectors) {
    try {
      const candidate = $(selector).first();
      if (candidate.length > 0 && normalizeText(candidate.text())) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return $("body").first();
};

const getPageTitle = (
  $: CheerioAPI,
  contentRoot: Cheerio<AnyNode>,
  url: string,
) =>
  normalizeText(
    contentRoot.find("h1").first().text() || $("title").first().text() || url,
  );

const extractContentBlocks = (
  $: CheerioAPI,
  contentRoot: Cheerio<AnyNode>,
  pageUrl: string,
) => {
  const blocks: ExtractedBlock[] = [];
  const headingPath: string[] = [];

  contentRoot
    .find("h1,h2,h3,h4,h5,h6,p,pre,table,ul,ol,blockquote")
    .each((_, element) => {
      if (!("tagName" in element)) {
        return;
      }

      const node = $(element);
      const tagName = element.tagName.toLowerCase();
      const text = normalizeText(node.text());

      if (!text) {
        return;
      }

      if (isHeading(tagName)) {
        updateHeadingPath(headingPath, tagName, text);
        return;
      }

      const type = getContentType(tagName);
      blocks.push({
        type,
        text,
        headingPath: [...headingPath],
        links: extractLinks($, node, pageUrl),
        ...getCodeLanguage(node, type),
      });
    });

  return blocks;
};

const isHeading = (tagName: string) => /^h[1-6]$/.test(tagName);

const updateHeadingPath = (
  headingPath: string[],
  tagName: string,
  text: string,
) => {
  const level = Number(tagName.slice(1));
  headingPath.length = level - 1;
  headingPath[level - 1] = text;
};

const getContentType = (tagName: string): KnowledgeContentType => {
  if (tagName === "pre") {
    return "CODE";
  }

  if (tagName === "table") {
    return "TABLE";
  }

  if (tagName === "ul" || tagName === "ol") {
    return "LIST";
  }

  if (tagName === "blockquote") {
    return "WARNING";
  }

  return "PROSE";
};

const getCodeLanguage = (
  node: Cheerio<AnyNode>,
  type: KnowledgeContentType,
) => {
  if (type !== "CODE") {
    return {};
  }

  const className = node.find("code").attr("class") ?? node.attr("class");

  if (!className) {
    return {};
  }

  return { language: className.replace(/language-/, "") };
};

const extractLinks = (
  $: CheerioAPI,
  node: Cheerio<AnyNode>,
  baseUrl: string,
): ExtractedLink[] => {
  const links: ExtractedLink[] = [];

  node
    .find("a[href]")
    .addBack("a[href]")
    .each((_, anchor) => {
      const href = $(anchor).attr("href");

      if (!href) {
        return;
      }

      try {
        const target = new URL(href, baseUrl);

        if (target.protocol !== "http:" && target.protocol !== "https:") {
          return;
        }

        links.push({
          text: normalizeText($(anchor).text()) || href,
          url: target.toString(),
        });
      } catch {
        return;
      }
    });

  return links;
};

const getCanonicalUrl = ($: CheerioAPI, pageUrl: string) => {
  const canonicalHref = $("link[rel='canonical']").attr("href");
  return canonicalHref ? new URL(canonicalHref, pageUrl).toString() : pageUrl;
};

const hashContent = (title: string, blocks: ExtractedBlock[]) =>
  createHash("sha256").update(JSON.stringify({ title, blocks })).digest("hex");

const normalizeText = (value: string) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r\f ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

export { extractKnowledgeContent };

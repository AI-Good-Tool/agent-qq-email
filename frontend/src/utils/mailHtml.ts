/**
 * 邮件正文渲染。
 * HTML 邮件不直接 v-html：先解析成 DOM，再只用白名单标签“重建”一棵干净的节点树，
 * 去掉脚本、样式、隐藏的预览文字、移动端/桌面端重复内容以及排版用的布局表格。
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';

type Ctx = { hidden: Set<Element>; seen: Set<string>; inLink: boolean; out: Document };

const SKIPPED = new Set(['head', 'title', 'meta', 'link', 'style', 'script', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'object', 'embed', 'input', 'select', 'textarea', 'map', 'area', 'video', 'audio', 'button', 'form']);
const CONTAINERS = new Set(['div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'center', 'address', 'figure', 'figcaption', 'fieldset', 'dl', 'dt', 'dd', 'tbody', 'thead', 'tfoot']);
const BLOCK_SELECTOR = 'p,div,table,h1,h2,h3,h4,h5,h6,ul,ol,blockquote';
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁪-⁯ㅤ﻿ﾠ]/g;
const URL_PATTERN = /https?:\/\/[^\s<>"'，。；！？、）】」]+/g;
const DUPLICATE_MIN_LENGTH = 60;

const normalize = (value: string) => value.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
const safeHref = (value: string | null) => {
  const href = (value || '').trim();
  return /^(https?:|mailto:)/i.test(href) ? href : null;
};
function shortUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname.length > 1 || url.search ? '/…' : ''}`;
  } catch {
    return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  }
}

function hiddenInline(el: Element) {
  const style = `${(el.getAttribute('style') || '').toLowerCase().replace(/\s+/g, '')};`;
  return el.hasAttribute('hidden')
    || /display:none[;!]|visibility:hidden[;!]|mso-hide:all[;!]|opacity:0[;!]/.test(style)
    || (/max-height:0(px)?[;!]/.test(style) && style.includes('overflow:hidden'))
    || /(^|\s)(preheader|preview-text)(\s|$)/i.test(el.getAttribute('class') || '');
}

function topLevelCss(css: string) {
  let result = '';
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== '@') { result += css[i]; continue; }
    const semicolon = css.indexOf(';', i);
    const brace = css.indexOf('{', i);
    if (brace < 0 || (semicolon >= 0 && semicolon < brace)) { i = semicolon < 0 ? css.length : semicolon; continue; }
    let depth = 0;
    for (i = brace; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) break;
    }
  }
  return result;
}

// 邮件常把移动端/桌面端两套内容都写进 HTML，再用 <style> 隐藏其中一套；@media 内的规则不参与判断
function hiddenByStylesheet(doc: Document) {
  const hidden = new Set<Element>();
  for (const style of Array.from(doc.querySelectorAll('style'))) {
    const css = topLevelCss((style.textContent || '').replace(/\/\*[\s\S]*?\*\//g, ''));
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/display:none|visibility:hidden|mso-hide:all/.test(match[2].toLowerCase().replace(/\s+/g, ''))) continue;
      try { doc.querySelectorAll(match[1].trim()).forEach((el) => hidden.add(el)); } catch { /* 非标准选择器忽略 */ }
    }
  }
  return hidden;
}

const visible = (el: Element, ctx: Ctx) => !ctx.hidden.has(el) && !hiddenInline(el);
const directRows = (table: Element) => Array.from(table.querySelectorAll('tr')).filter((row) => row.closest('table') === table);
const directCells = (row: Element, ctx: Ctx) => Array.from(row.children)
  .filter((cell) => (cell.tagName === 'TD' || cell.tagName === 'TH') && visible(cell, ctx) && normalize(cell.textContent || ''));

// 只有不嵌套表格、多列短文本的表格才按数据表格展示，其余视为布局表格
function isDataTable(table: Element, ctx: Ctx) {
  if (table.querySelector('table')) return false;
  const rows = directRows(table);
  if (!rows.length || rows.length > 40) return false;
  const cells = rows.map((row) => directCells(row, ctx));
  return cells.some((row) => row.length >= 2) && cells.flat().every((cell) => normalize(cell.textContent || '').length <= 100);
}

const hasContent = (nodes: Node[]) => nodes.some((n) => (n.nodeType === Node.TEXT_NODE ? (n.textContent || '').trim().length > 0 : n.nodeName !== 'BR'));

function make(ctx: Ctx, tag: string, kids: Node[], attrs: Record<string, string> = {}) {
  const el = ctx.out.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  kids.forEach((kid) => el.appendChild(kid));
  return el;
}
const block = (ctx: Ctx, tag: string, kids: Node[], className?: string): Node[] =>
  hasContent(kids) ? [make(ctx, tag, kids, className ? { class: className } : {})] : [];

function link(ctx: Ctx, href: string, label: Node[] | string, title?: string) {
  const attrs: Record<string, string> = { href, target: '_blank', rel: 'noopener noreferrer nofollow' };
  if (title) attrs.title = title;
  return make(ctx, 'a', typeof label === 'string' ? [ctx.out.createTextNode(label)] : label, attrs);
}

function renderText(value: string, ctx: Ctx): Node[] {
  const text = value.replace(INVISIBLE, '').replace(/\s+/g, ' ');
  if (!text.trim()) return text ? [ctx.out.createTextNode(' ')] : [];
  if (ctx.inLink) return [ctx.out.createTextNode(text)];
  const parts: Node[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;:!?)\]]+$/, '');
    const start = match.index ?? 0;
    if (start > last) parts.push(ctx.out.createTextNode(text.slice(last, start)));
    parts.push(link(ctx, url, shortUrl(url), url));
    last = start + url.length;
  }
  if (last < text.length) parts.push(ctx.out.createTextNode(text.slice(last)));
  return parts;
}

const children = (node: Node, ctx: Ctx): Node[] => Array.from(node.childNodes).flatMap((child) => renderNode(child, ctx));

function renderLink(el: Element, ctx: Ctx): Node[] {
  const label = children(el, { ...ctx, inLink: true });
  const text = normalize(el.textContent || '') || normalize(Array.from(el.querySelectorAll('img')).map((img) => img.getAttribute('alt') || '').join(' '));
  if (!text) return [];
  const href = safeHref(el.getAttribute('href'));
  if (!href) return label;
  const content = /^(https?:\/\/|www\.)/i.test(text) ? shortUrl(text.startsWith('www.') ? `https://${text}` : text) : label;
  return [link(ctx, href, content, href.startsWith('mailto:') ? undefined : href)];
}

function renderDataTable(table: Element, ctx: Ctx): Node[] {
  const rows = directRows(table).map((row) => {
    const cells = directCells(row, ctx).map((cell) => make(ctx, cell.tagName === 'TH' ? 'th' : 'td', children(cell, ctx)));
    return cells.length ? make(ctx, 'tr', cells) : null;
  }).filter((row): row is HTMLElement => row !== null);
  if (!rows.length) return [];
  return [make(ctx, 'div', [make(ctx, 'table', [make(ctx, 'tbody', rows)], { class: 'mail-data-table' })], { class: 'mail-table-wrap' })];
}

function renderElement(el: Element, tag: string, ctx: Ctx): Node[] {
  if (ctx.inLink) {
    if (tag === 'img') { const alt = normalize(el.getAttribute('alt') || ''); return alt ? [ctx.out.createTextNode(alt)] : []; }
    if (tag === 'br') return [ctx.out.createTextNode(' ')];
    return children(el, ctx);
  }
  const kids = () => children(el, ctx);
  switch (tag) {
    case 'br': return [make(ctx, 'br', [])];
    case 'hr': return [make(ctx, 'hr', [])];
    case 'img': {
      const alt = normalize(el.getAttribute('alt') || '');
      return alt && alt.length <= 60 ? [make(ctx, 'span', [ctx.out.createTextNode(`图片：${alt}`)], { class: 'mail-image-alt' })] : [];
    }
    case 'a': return renderLink(el, ctx);
    case 'strong': case 'b': {
      const content = kids();
      if (!hasContent(content)) return [];
      const plain = normalize(el.textContent || '').length > 120 || el.querySelector(BLOCK_SELECTOR);
      return plain ? content : [make(ctx, 'strong', content)];
    }
    case 'em': case 'i': case 'cite': return block(ctx, 'em', kids());
    case 's': case 'del': case 'strike': return block(ctx, 'del', kids());
    case 'sup': case 'sub': return block(ctx, tag, kids());
    case 'code': case 'kbd': case 'samp': case 'tt': return block(ctx, 'code', kids());
    case 'pre': return el.textContent?.trim() ? [make(ctx, 'pre', [ctx.out.createTextNode(el.textContent)])] : [];
    case 'blockquote': return block(ctx, 'blockquote', kids());
    case 'ul': case 'ol': return block(ctx, tag, kids());
    case 'li': return block(ctx, 'li', kids());
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const text = normalize(el.textContent || '');
      if (text.length > 80 || el.querySelector('p,div,table,ul,ol')) return block(ctx, 'p', kids());
      return block(ctx, tag === 'h1' || tag === 'h2' ? 'h3' : 'h4', kids());
    }
    case 'table': return isDataTable(el, ctx) ? renderDataTable(el, ctx) : block(ctx, 'div', kids());
    case 'tr': return block(ctx, 'div', kids());
    case 'p': return block(ctx, 'p', kids());
    case 'td': case 'th': return block(ctx, 'div', kids(), 'mail-block');
    default:
      if (CONTAINERS.has(tag)) return block(ctx, 'div', kids());
      return kids();
  }
}

function renderNode(node: Node, ctx: Ctx): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return renderText(node.textContent || '', ctx);
  if (!(node instanceof Element)) return [];
  const tag = node.tagName.toLowerCase();
  if (SKIPPED.has(tag) || !visible(node, ctx)) return [];
  const isBlock = CONTAINERS.has(tag) || ['table', 'tr', 'td', 'th', 'p'].includes(tag);
  const blockText = isBlock ? normalize(node.textContent || '') : '';
  const dedupe = blockText.length >= DUPLICATE_MIN_LENGTH;
  if (dedupe && ctx.seen.has(blockText)) return [];
  const result = renderElement(node, tag, ctx);
  if (dedupe) ctx.seen.add(blockText);
  return result;
}

const EMPTY = '<p class="mail-empty">（邮件正文为空）</p>';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

export function renderMailBody(body?: string, format?: string): { html: string; kind: 'html' | 'plain' } {
  if (!body?.trim()) return { html: EMPTY, kind: 'plain' };
  if (format?.toUpperCase() === 'HTML') {
    const source = new DOMParser().parseFromString(body, 'text/html');
    const out = document.implementation.createHTMLDocument('');
    const ctx: Ctx = { hidden: hiddenByStylesheet(source), seen: new Set(), inLink: false, out };
    const nodes = children(source.body, ctx);
    if (!hasContent(nodes)) return { html: EMPTY, kind: 'html' };
    const holder = out.createElement('div');
    nodes.forEach((n) => holder.appendChild(n));
    return { html: holder.innerHTML, kind: 'html' };
  }
  const html = marked.parse(body, { gfm: true, breaks: true, async: false }) as string;
  return { html: DOMPurify.sanitize(html, { FORBID_TAGS: ['img', 'style', 'form', 'input'] }), kind: 'plain' };
}

/**
 * rehype plugin turning kumihimo code blocks into inline SVG.
 *
 * Works on the HAST a Markdown pipeline produces, so a `.khm` fence in a document becomes
 * a real drawing at build time. The SVG is inlined rather than linked: it carries no
 * external references, so the page needs no extra request and no runtime.
 */

import type { Element, Parent, Root, RootContent } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { visit } from 'unist-util-visit';

import type { CompileOptions, Diagnostic } from '@love-rox/kumihimo-core';
import { compile } from '@love-rox/kumihimo-core';

/** How the plugin behaves. */
export interface RehypeKumihimoOptions extends CompileOptions {
  /**
   * Code fence languages to render.
   *
   * Defaults to `kumihimo` and `khm`.
   */
  languages?: string[];
  /** Class applied to the wrapper element around each diagram. */
  className?: string;
  /**
   * Called once per rendered block with whatever the compile had to say.
   *
   * A wiring fault should not silently become a nice-looking picture in someone's docs,
   * so this is the hook a build uses to surface or fail on diagnostics.
   */
  onDiagnostics?: (diagnostics: readonly Diagnostic[], source: string) => void;
  /**
   * Leave the original code block in place alongside the diagram.
   *
   * Useful for documentation that teaches the language rather than merely using it.
   */
  keepSource?: boolean;
}

const DEFAULT_LANGUAGES = ['kumihimo', 'khm'];

/** Extract the fence language from a `<code>` element's class list. */
function languageOf(node: Element): string | undefined {
  const className = node.properties?.['className'];
  const classes = Array.isArray(className) ? className : [];
  for (const entry of classes) {
    const name = String(entry);
    if (name.startsWith('language-')) return name.slice('language-'.length);
  }
  return undefined;
}

/** Concatenate the text inside a node, which is all a code fence ever holds. */
function textOf(node: Element): string {
  let text = '';
  visit(node, 'text', (child) => {
    text += child.value;
  });
  return text;
}

/** Parse rendered SVG markup into HAST, in the SVG namespace. */
function svgToHast(svg: string): RootContent[] {
  return fromHtml(svg, { fragment: true, space: 'svg' }).children as RootContent[];
}

/** A `<pre>` holding a kumihimo fence, and where it sits. */
interface Target {
  parent: Parent;
  index: number;
  source: string;
}

/**
 * Render kumihimo code fences into inline SVG diagrams.
 *
 * A fence such as ` ```kumihimo ` is replaced by a `<div>` wrapping the rendered SVG.
 *
 * @param options - Languages to match, wrapper class, diagnostics hook and any compile
 *   overrides such as `theme`.
 * @returns A unified transformer.
 */
export function rehypeKumihimo(options: RehypeKumihimoOptions = {}) {
  const languages = options.languages ?? DEFAULT_LANGUAGES;
  const className = options.className ?? 'kumihimo';

  return async function transformer(tree: Root): Promise<void> {
    // Collect before rendering. The walk is synchronous but compiling is not, and
    // splicing the tree mid-walk would invalidate the indices this needs.
    const targets: Target[] = [];

    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined) return;
      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code',
      );
      if (!code) return;
      const language = languageOf(code);
      if (language === undefined || !languages.includes(language)) return;
      targets.push({ parent, index, source: textOf(code) });
    });

    // Replace back to front so earlier indices stay valid as the tree changes under us.
    // A copy rather than `reverse()`: the order this was collected in is not this loop's
    // to spend, and nothing downstream should have to know that it was.
    for (const target of targets.toReversed()) {
      const { svg, diagnostics } = await compile(target.source, options);
      options.onDiagnostics?.(diagnostics, target.source);

      const figure: Element = {
        type: 'element',
        tagName: 'div',
        properties: { className: [className] },
        children: svgToHast(svg) as Element['children'],
      };

      const original = target.parent.children[target.index] as RootContent;
      const replacement = options.keepSource ? [original, figure] : [figure];
      target.parent.children.splice(target.index, 1, ...replacement);
    }
  };
}

export default rehypeKumihimo;

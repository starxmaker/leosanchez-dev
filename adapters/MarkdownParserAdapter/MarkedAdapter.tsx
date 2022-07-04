import { marked } from 'marked';
import hljs from 'highlight.js';
import { IMarkdownParserAdapter } from './IMarkdownParserAdapter';
import { Service } from 'typedi';
@Service()
export class MarkedAdapter implements IMarkdownParserAdapter {
  parse(markdown: string): string {
    marked.setOptions({
      highlight: (code, lang) => {
        if (lang) {
          return hljs.highlight(lang, code).value;
        }
        return hljs.highlightAuto(code).value;
      },
    });
    return marked(markdown);
  }
}

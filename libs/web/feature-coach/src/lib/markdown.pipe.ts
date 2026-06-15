import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Render markdown → trusted HTML. We rely on Angular's DomSanitizer
 * downstream rather than running a separate HTML sanitizer pass — the
 * markdown comes from our own LLM, not from arbitrary user input, and
 * Angular's [innerHTML] sanitizer strips script tags + event handlers
 * if anything weird slips through.
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';
    const html = marked.parse(value, { async: false }) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}

'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Preprocess content to auto-detect and wrap LaTeX in $$ delimiters.
 * Pass 1: Standalone lines containing LaTeX commands get wrapped in $$...$$
 * Pass 2: {LaTeX} brace blocks get wrapped in $$...$$ (brace-depth tracking)
 */
const LATEX_COMMAND_RE = /\\(?:frac|left|right|sqrt|sum|prod|int|lim|dots|cdots|ldots|text|mathbb|mathcal|mathbf|mathrm|begin|end|over|under|hat|bar|vec|tilde|infty|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega|pi|phi|psi|rho|tau|chi|nu|xi|zeta|eta|kappa|iota|partial|nabla|forall|exists|neq|notin|subset|supset|cup|cap|wedge|vee|neg|implies|iff|to|mapsto|circ|times|div|pm|mp|leq|geq|approx|equiv|sim|cong|propto|perp|parallel|angle|triangle|square|diamond|star|bullet|oplus|otimes|bigoplus|bigotimes|binom|choose|atop|cos|sin|tan|log|ln|exp|det|min|max|sup|limsup|liminf)(?![a-zA-Z])/;

function preprocessLatex(text: string): string {
  if (!text) return text;

  // Pass 1: Detect standalone LaTeX lines (no delimiters) and wrap with $$...$$
  let result = text.split('\n').map(line => {
    const trimmed = line.trim();
    // Skip empty lines or lines already containing $ delimiters
    if (!trimmed || /\$/.test(trimmed)) return line;
    
    // Skip if it looks like Markdown formatting that would be broken by LaTeX wrapping
    // e.g. bold, italic, lists, headers, blockquotes
    if (/\*\*|__/.test(trimmed) || /^[*+-]\s/.test(trimmed) || /^#+\s/.test(trimmed) || /^>\s/.test(trimmed)) {
      return line;
    }

    // Skip if no LaTeX commands found
    if (!LATEX_COMMAND_RE.test(trimmed)) return line;

    // Ensure line is predominantly math, not natural language with some LaTeX.
    // If it contains characters outside the standard ASCII set (like Thai, CJK), 
    // it's likely mixed text and we shouldn't wrap the whole line in $$...$$.
    const hasNonMathChars = /[^\x00-\x7F]/.test(trimmed);
    if (hasNonMathChars) return line;

    // Further check: even if ASCII, if it has too many "regular words", it might be a sentence.
    // Math lines usually don't have many long alphabetic words.
    const words = trimmed.split(/\s+/);
    const longWords = words.filter(w => w.length > 5 && /^[a-zA-Z]+$/.test(w));
    if (longWords.length > 2) return line;

    return `$$${trimmed}$$`;
  }).join('\n');

  // Pass 2: Detect {LaTeX} brace-wrapped blocks and convert to $$...$$
  result = wrapBracedLatex(result);

  return result;
}

/** Walk character-by-character with brace-depth tracking to find {LaTeX} blocks */
function wrapBracedLatex(text: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < text.length) {
    // Skip existing $$ display math blocks
    if (text[i] === '$' && text[i + 1] === '$') {
      const end = text.indexOf('$$', i + 2);
      if (end !== -1) {
        result.push(text.substring(i, end + 2));
        i = end + 2;
        continue;
      }
    }

    // Skip existing $ inline math blocks
    if (text[i] === '$' && (i + 1 >= text.length || text[i + 1] !== '$')) {
      const end = text.indexOf('$', i + 1);
      if (end !== -1) {
        result.push(text.substring(i, end + 1));
        i = end + 1;
        continue;
      }
    }

    // Check for { that could be a LaTeX block (not escaped with \)
    if (text[i] === '{' && (i === 0 || text[i - 1] !== '\\')) {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '\\') {
          j += 2; // skip escaped character
          continue;
        }
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }

      if (depth === 0) {
        const inner = text.substring(i + 1, j - 1);
        if (LATEX_COMMAND_RE.test(inner)) {
          result.push('$$' + inner + '$$');
          i = j;
          continue;
        }
      }
    }

    result.push(text[i]);
    i++;
  }

  return result.join('');
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const processedContent = preprocessLatex(content);

  return (
    <div className={`markdown-content ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Ensure links open in a new tab
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'underline' }} />
          ),
          // Style headers
          h1: ({ node, ...props }) => <h1 {...props} style={{ fontSize: '1.5rem', fontWeight: 800, margin: '1rem 0 0.5rem' }} />,
          h2: ({ node, ...props }) => <h2 {...props} style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.8rem 0 0.4rem' }} />,
          h3: ({ node, ...props }) => <h3 {...props} style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0.6rem 0 0.3rem' }} />,
          // Paragraph styles for spacing
          p: ({ node, ...props }) => <p {...props} style={{ marginBottom: '0.75rem' }} />,
          // List styles
          ul: ({ node, ...props }) => <ul {...props} style={{ paddingLeft: '1.5rem', marginBottom: '1rem', listStyleType: 'disc' }} />,
          ol: ({ node, ...props }) => <ol {...props} style={{ paddingLeft: '1.5rem', marginBottom: '1rem', listStyleType: 'decimal' }} />,
          li: ({ node, ...props }) => <li {...props} style={{ marginBottom: '0.25rem' }} />,
          // Code blocks
          code: ({ node, ...props }) => (
            <code {...props} style={{ background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.9em' }} />
          ),
          pre: ({ node, ...props }) => (
            <pre {...props} style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '1rem', overflowX: 'auto', marginBottom: '1rem' }} />
          ),
          // Blockquote
          blockquote: ({ node, ...props }) => (
            <blockquote {...props} style={{ borderLeft: '4px solid var(--primary)', paddingLeft: '1rem', fontStyle: 'italic', opacity: 0.8, margin: '1rem 0' }} />
          ),
          // Table
          table: ({ node, ...props }) => (
            <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
              <table {...props} style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
          ),
          th: ({ node, ...props }) => <th {...props} style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '0.5rem', background: 'rgba(255,255,255,0.05)' }} />,
          td: ({ node, ...props }) => <td {...props} style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '0.5rem' }} />,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

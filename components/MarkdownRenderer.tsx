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

  // Pass 2: Detect inline LaTeX commands and wrap surrounding math context in $...$
  // This handles mixed text like "Thai text x \to a"
  result = wrapInlineLatex(result);

  return result;
}

/**
 * Find LaTeX commands and wrap the surrounding math expression in $...$
 * Uses a Thai-aware expansion strategy to find the boundaries of the math expression.
 */
function wrapInlineLatex(text: string): string {
  if (!text) return text;
  
  // Split by existing $ or $$ blocks to avoid double-wrapping
  const parts = text.split(/(\$\$?[\s\S]+?\$?\$)/g);
  
  return parts.map((part, index) => {
    // index % 2 !== 0 means it's an existing $...$ or $$...$$ block
    if (index % 2 !== 0) return part;
    
    let segment = part;
    const COMMAND_PATTERN = new RegExp(LATEX_COMMAND_RE.source, 'g');
    const isMath = new Array(segment.length).fill(false);
    let match;
    
    // For every LaTeX command found, expand to include surrounding math-friendly chars
    while ((match = COMMAND_PATTERN.exec(segment)) !== null) {
      let start = match.index;
      let end = match.index + match[0].length;
      
      // Expansion rule: Expand as long as we don't hit Thai characters, Quotes, delimiters ($), or newlines.
      // We allow spaces and punctuation during expansion to capture the full context.
      const BOUNDARY_CHAR = /[\u0E00-\u0E7F"'\n$]/;
      
      while (start > 0 && !BOUNDARY_CHAR.test(segment[start - 1])) {
        start--;
      }
      while (end < segment.length && !BOUNDARY_CHAR.test(segment[end])) {
        end++;
      }
      
      // Trim the expanded block to remove leading/trailing spaces and punctuation.
      // This ensures that $ wraps only the actual math expression.
      // We allow internal spaces and punctuation (like commas in coordinates).
      const sub = segment.substring(start, end);
      const trimmed = sub.trim().replace(/^[.,!?;:]+|[.,!?;:]+$/g, '').trim();
      
      if (trimmed) {
        const actualStart = start + sub.indexOf(trimmed);
        const actualEnd = actualStart + trimmed.length;
        for (let i = actualStart; i < actualEnd; i++) isMath[i] = true;
      }
    }
    
    // Reconstruct the segment with $ delimiters around math blocks
    let result = '';
    let inMath = false;
    let currentMath = '';
    
    for (let i = 0; i < segment.length; i++) {
      if (isMath[i]) {
        if (!inMath) {
          inMath = true;
          currentMath = segment[i];
        } else {
          currentMath += segment[i];
        }
      } else {
        if (inMath) {
          inMath = false;
          const trimmed = currentMath.trim();
          if (trimmed) {
            const leading = currentMath.match(/^\s*/)?.[0] || '';
            const trailing = currentMath.match(/\s*$/)?.[0] || '';
            result += leading + '$' + trimmed + '$' + trailing;
          } else {
            result += currentMath;
          }
          currentMath = '';
        }
        result += segment[i];
      }
    }
    if (inMath) {
      const trimmed = currentMath.trim();
      if (trimmed) {
        const leading = currentMath.match(/^\s*/)?.[0] || '';
        const trailing = currentMath.match(/\s*$/)?.[0] || '';
        result += leading + '$' + trimmed + '$' + trailing;
      } else {
        result += currentMath;
      }
    }
    return result;
  }).join('');
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

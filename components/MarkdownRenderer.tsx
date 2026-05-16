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
 * Pass 1: Standalone lines containing LaTeX or chemistry notations get wrapped in $$...$$
 * Pass 2: Inline notations get wrapped in $...$
 */
const MATH_OR_CHEM_RE = /(?:\\(?:frac|left|right|sqrt|sum|prod|int|lim|dots|cdots|ldots|text|mathbb|mathcal|mathbf|mathrm|begin|end|over|under|hat|bar|vec|tilde|infty|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega|pi|phi|psi|rho|tau|chi|nu|xi|zeta|eta|kappa|iota|partial|nabla|forall|exists|neq|notin|subset|supset|cup|cap|wedge|vee|neg|implies|iff|to|mapsto|circ|times|div|pm|mp|leq|geq|approx|equiv|sim|cong|propto|perp|parallel|angle|triangle|square|diamond|star|bullet|oplus|otimes|bigoplus|bigotimes|binom|choose|atop|cos|sin|tan|log|ln|exp|det|min|max|sup|limsup|liminf|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|rightleftharpoons|rightharpoondown|rightharpoonup|leftharpoondown|leftharpoonup)(?![a-zA-Z]))|(?:[A-Z][a-z]?[\^_](?:\{[0-9+\-]+\}|[0-9+\-]))/;

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

    // Skip if no LaTeX or chemistry notations found
    if (!MATH_OR_CHEM_RE.test(trimmed)) return line;

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
    const COMMAND_PATTERN = new RegExp(MATH_OR_CHEM_RE.source, 'g');
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
            <a {...props} target="_blank" rel="noopener noreferrer" className="text-black font-black underline decoration-4 underline-offset-2 hover:bg-yellow-300" />
          ),
          // Style headers
          h1: ({ node, ...props }) => <h1 {...props} className="text-2xl font-black uppercase mt-8 mb-4 border-b-4 border-black inline-block" />,
          h2: ({ node, ...props }) => <h2 {...props} className="text-xl font-black uppercase mt-6 mb-3" />,
          h3: ({ node, ...props }) => <h3 {...props} className="text-lg font-black uppercase mt-4 mb-2" />,
          // Paragraph styles for spacing
          p: ({ node, ...props }) => <p {...props} className="mb-4 font-bold" />,
          // List styles
          ul: ({ node, ...props }) => <ul {...props} className="pl-6 mb-4 list-disc font-bold" />,
          ol: ({ node, ...props }) => <ol {...props} className="pl-6 mb-4 list-decimal font-bold" />,
          li: ({ node, ...props }) => <li {...props} className="mb-2" />,
          // Code blocks
          code: ({ node, ...props }) => (
            <code {...props} className="bg-gray-200 border-2 border-black px-1.5 py-0.5 font-mono text-sm" />
          ),
          pre: ({ node, ...props }) => (
            <pre {...props} className="bg-white border-3 border-black p-4 mb-4 overflow-x-auto shadow-[4px_4px_0px_0px_#000]" />
          ),
          // Blockquote
          blockquote: ({ node, ...props }) => (
            <blockquote {...props} className="border-l-8 border-black pl-4 italic mb-4 font-bold bg-yellow-50 p-2" />
          ),
          // Table
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto mb-6">
              <table {...props} className="w-full border-4 border-black" />
            </div>
          ),
          th: ({ node, ...props }) => <th {...props} className="border-2 border-black p-3 bg-black text-white font-black uppercase text-sm" />,
          td: ({ node, ...props }) => <td {...props} className="border-2 border-black p-3 font-bold" />,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

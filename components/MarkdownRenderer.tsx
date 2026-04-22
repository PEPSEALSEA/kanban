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
 * Preprocess content to convert {LaTeX} syntax into $$LaTeX$$ for remark-math.
 * Detects curly-brace blocks containing LaTeX commands (backslash sequences)
 * and wraps them with $$ delimiters so KaTeX can render them.
 */
function preprocessLatex(text: string): string {
  if (!text) return text;

  // Match { ... } blocks that contain LaTeX commands (indicated by backslash)
  // This regex matches opening { that is NOT preceded by $ (to avoid breaking existing $${ }),
  // captures content with at least one backslash command, and closes with }
  return text.replace(
    /(?<!\$)\{((?:[^{}]|\{[^{}]*\})*\\[a-zA-Z]+(?:[^{}]|\{[^{}]*\})*)\}(?!\$)/g,
    (match, inner) => {
      // Only convert if it looks like LaTeX (contains common LaTeX commands)
      if (/\\(?:frac|left|right|sqrt|sum|prod|int|lim|dots|cdots|ldots|text|mathbb|mathcal|mathbf|mathrm|begin|end|over|under|hat|bar|vec|tilde|infty|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega|pi|phi|psi|rho|tau|chi|nu|xi|zeta|eta|kappa|iota|partial|nabla|forall|exists|in|notin|subset|supset|cup|cap|wedge|vee|neg|implies|iff|to|mapsto|circ|times|div|pm|mp|leq|geq|neq|approx|equiv|sim|cong|propto|perp|parallel|angle|triangle|square|diamond|star|bullet|oplus|otimes|bigoplus|bigotimes|binom|choose|atop)(?![a-zA-Z])/.test(inner)) {
        return `$$${inner}$$`;
      }
      return match;
    }
  );
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

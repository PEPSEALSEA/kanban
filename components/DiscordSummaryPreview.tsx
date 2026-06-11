'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import { preprocessDiscordMarkdown } from '@/lib/discord-markdown';

type DiscordSummaryPreviewProps = {
  content: string;
  className?: string;
};

export default function DiscordSummaryPreview({ content, className }: DiscordSummaryPreviewProps) {
  const processed = preprocessDiscordMarkdown(content);

  return (
    <div
      className={`markdown-content discord-summary-preview ${className || ''}`}
      style={{
        background: '#313338',
        color: '#dbdee1',
        padding: '1.25rem',
        borderRadius: '0.5rem',
        fontSize: '0.9rem',
        lineHeight: 1.6,
        border: '1px solid var(--admin-border)',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ children, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#00a8fc', textDecoration: 'none', fontWeight: 500 }}
            >
              {children}
            </a>
          ),
          h1: ({ children, ...props }) => (
            <h1 {...props} style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#f2f3f5' }}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 {...props} style={{ fontSize: '1.05rem', fontWeight: 700, margin: '1rem 0 0.5rem', color: '#f2f3f5' }}>
              {children}
            </h2>
          ),
          ul: ({ children, ...props }) => (
            <ul {...props} style={{ margin: '0.25rem 0 0.75rem', paddingLeft: '1.25rem', listStyleType: 'disc' }}>
              {children}
            </ul>
          ),
          li: ({ children, ...props }) => (
            <li {...props} style={{ marginBottom: '0.35rem' }}>
              {children}
            </li>
          ),
          p: ({ children, ...props }) => (
            <p {...props} style={{ margin: '0.35rem 0' }}>
              {children}
            </p>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              {...props}
              style={{
                margin: '0.75rem 0',
                paddingLeft: '0.75rem',
                borderLeft: '3px solid #4e5058',
                color: '#b5bac1',
              }}
            >
              {children}
            </blockquote>
          ),
          span: ({ className, children, ...props }) => {
            if (className === 'discord-spoiler') {
              return (
                <span
                  style={{
                    background: '#1e1f22',
                    color: '#1e1f22',
                    borderRadius: '3px',
                    padding: '0 2px',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    const el = e.currentTarget;
                    const revealed = el.dataset.revealed === 'true';
                    el.dataset.revealed = revealed ? 'false' : 'true';
                    el.style.color = revealed ? '#1e1f22' : '#dbdee1';
                  }}
                  title="Click to reveal spoiler"
                >
                  {children}
                </span>
              );
            }
            return <span className={className} {...props}>{children}</span>;
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

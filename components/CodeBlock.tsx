'use client';

import React, { useCallback, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

const LANG_LABELS: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  jsx: 'JavaScript',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  cs: 'C#',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  xml: 'XML',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  powershell: 'PowerShell',
  text: 'Text',
  txt: 'Text',
  plaintext: 'Text',
  markdown: 'Markdown',
  md: 'Markdown',
};

const LANG_EXTENSIONS: Record<string, string> = {
  python: 'py',
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  csharp: 'cs',
  cs: 'cs',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yaml: 'yml',
  yml: 'yml',
  xml: 'xml',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  powershell: 'ps1',
  text: 'txt',
  txt: 'txt',
  plaintext: 'txt',
  markdown: 'md',
  md: 'md',
};

const GEMINI_STYLE: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: '#e8eaed',
    background: 'none',
    fontFamily: "'Roboto Mono', 'Source Code Pro', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: '0.875rem',
    lineHeight: '1.6',
    textAlign: 'left' as const,
    whiteSpace: 'pre' as const,
    wordSpacing: 'normal',
    wordBreak: 'normal' as const,
    wordWrap: 'normal' as const,
    tabSize: 4,
  },
  'pre[class*="language-"]': {
    color: '#e8eaed',
    background: 'transparent',
    fontFamily: "'Roboto Mono', 'Source Code Pro', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: '0.875rem',
    lineHeight: '1.6',
    textAlign: 'left' as const,
    whiteSpace: 'pre' as const,
    wordSpacing: 'normal',
    wordBreak: 'normal' as const,
    wordWrap: 'normal' as const,
    tabSize: 4,
    margin: 0,
    padding: 0,
    overflow: 'auto',
  },
  comment: { color: '#9aa0a6', fontStyle: 'italic' },
  prolog: { color: '#9aa0a6' },
  doctype: { color: '#9aa0a6' },
  cdata: { color: '#9aa0a6' },
  punctuation: { color: '#e8eaed' },
  property: { color: '#e8eaed' },
  tag: { color: '#78d9ec' },
  boolean: { color: '#ff7eb3' },
  number: { color: '#ff7eb3' },
  constant: { color: '#ff7eb3' },
  symbol: { color: '#ff7eb3' },
  deleted: { color: '#ff7eb3' },
  selector: { color: '#81c995' },
  'attr-name': { color: '#78d9ec' },
  string: { color: '#81c995' },
  char: { color: '#81c995' },
  builtin: { color: '#78d9ec' },
  inserted: { color: '#81c995' },
  operator: { color: '#e8eaed' },
  entity: { color: '#e8eaed' },
  url: { color: '#81c995' },
  variable: { color: '#e8eaed' },
  atrule: { color: '#78d9ec' },
  'attr-value': { color: '#81c995' },
  function: { color: '#e8eaed' },
  'class-name': { color: '#78d9ec' },
  keyword: { color: '#78d9ec' },
  regex: { color: '#81c995' },
  important: { color: '#78d9ec', fontWeight: 'bold' },
  bold: { fontWeight: 'bold' },
  italic: { fontStyle: 'italic' },
};

function formatLanguageLabel(language: string): string {
  const key = language.toLowerCase();
  if (LANG_LABELS[key]) return LANG_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function getFileExtension(language: string): string {
  const key = language.toLowerCase();
  return LANG_EXTENSIONS[key] || 'txt';
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

interface CodeBlockProps {
  code: string;
  language: string;
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const label = formatLanguageLabel(language);
  const normalizedLang = language.toLowerCase() === 'text' || language.toLowerCase() === 'txt' || language.toLowerCase() === 'plaintext'
    ? 'text'
    : language.toLowerCase();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const handleDownload = useCallback(() => {
    const ext = getFileExtension(language);
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `code.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [code, language]);

  return (
    <div className="code-block-gemini not-prose my-6">
      <div className="code-block-gemini__header">
        <span className="code-block-gemini__lang">{label}</span>
        <div className="code-block-gemini__actions">
          <button
            type="button"
            onClick={handleDownload}
            className="code-block-gemini__btn"
            title="Download"
            aria-label="Download code"
          >
            <DownloadIcon />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="code-block-gemini__btn"
            title={copied ? 'Copied!' : 'Copy'}
            aria-label={copied ? 'Copied' : 'Copy code'}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>
      <div className="code-block-gemini__body">
        <SyntaxHighlighter
          language={normalizedLang}
          style={GEMINI_STYLE}
          customStyle={{
            margin: 0,
            padding: '1rem 1.25rem',
            background: 'transparent',
          }}
          codeTagProps={{
            style: {
              fontFamily: "'Roboto Mono', 'Source Code Pro', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

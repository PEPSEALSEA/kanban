/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        card: 'var(--bg-card)',
        muted: 'var(--bg-muted)',
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'text-main': 'var(--text-main)',
        'text-muted': 'var(--text-muted)',
        'border-subtle': 'var(--border-subtle)',
        'accent-blue': 'var(--accent-blue)',
      },
    },
  },
  plugins: [],
}

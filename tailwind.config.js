/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Noto Sans SC"',
          'sans-serif',
        ],
        serif: [
          '"Iowan Old Style"',
          '"Songti SC"',
          '"Noto Serif SC"',
          'Georgia',
          'serif',
        ],
        mono: [
          '"SFMono-Regular"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      colors: {
        paper: '#f7f6f3',
        ink: '#292524',
      },
      boxShadow: {
        'note-light':
          '0 1px 2px rgba(41, 37, 36, 0.04), 0 12px 28px -12px rgba(41, 37, 36, 0.14), 0 42px 90px -40px rgba(41, 37, 36, 0.3)',
        'note-dark':
          'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 30px 80px -28px rgba(0, 0, 0, 0.9)',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}

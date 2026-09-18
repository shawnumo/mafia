/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Georgia', 'serif'],
        sans: ['"Trebuchet MS"', 'sans-serif']
      },
      colors: {
        ink: '#102a2a',
        paper: '#f4f0e8',
        ember: '#c45232',
        sage: '#829b78',
        brass: '#b98a44'
      }
    }
  },
  plugins: []
}

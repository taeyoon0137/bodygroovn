import taeyoonReact from 'eslint-config-taeyoon/react'
import react from 'eslint-plugin-react'

export default [
  {
    ignores: [
      'build/**',
      'bundle/**',
      'coverage/**',
      'lib/CSInterface/CSInterface.js',
      'node_modules/**',
      'player/**',
      '.yarn/**',
      'src/lottie.js',
    ],
  },
  ...taeyoonReact,
  {
    files: ['src/**/*.{js,jsx}', '*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        __BODYGROOVN_VERSION__: 'readonly',
        CSInterface: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      sourceType: 'module',
    },
    plugins: {
      react,
    },
    rules: {
      'import/order': 'off',
      'no-async-promise-executor': 'off',
      'no-constant-binary-expression': 'off',
      'no-empty': 'off',
      'no-prototype-builtins': 'off',
      'no-unused-vars': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
      'react/jsx-uses-vars': 'error',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'unused-imports/no-unused-imports': 'off',
    },
  },
]

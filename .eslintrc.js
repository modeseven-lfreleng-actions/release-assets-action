// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 The Linux Foundation

module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-console': 'off', // Allow console.log for GitHub Actions
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    'no-var': 'error',
    'no-duplicate-imports': 'error',
    'no-redeclare': 'error',
    'no-undef': 'error',
  },
  globals: {
    // GitHub Actions script context globals
    github: 'readonly',
    context: 'readonly',
    core: 'readonly',
    glob: 'readonly',
    io: 'readonly',
    exec: 'readonly',
    require: 'readonly',
  },
};

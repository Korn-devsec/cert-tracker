import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // CLAUDE.md: ห้ามใช้ any ยกเว้นจำเป็นจริงและมี comment อธิบาย
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);

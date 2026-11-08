import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', '.wrangler/**', '.pnpm-store/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  {
    files: ['worker/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "TaggedTemplateExpression[tag.name='sql'], MemberExpression[object.name='sql'][property.name='raw']", message: 'Use the Drizzle query builder instead of handwritten SQL.' },
        { selector: "MemberExpression[object.property.name='DB'][property.name=/^(prepare|exec|batch)$/]", message: 'Use Drizzle for D1 queries.' },
      ],
    },
  },
]

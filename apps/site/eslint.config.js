//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  ...tanstackConfig,
  {
    // the source carries `eslint-disable-next-line react-hooks/exhaustive-deps`
    // comments, which are an ERROR when the rule is not registered — and
    // without the plugin the deps checking they opt out of was never running
    // in the first place
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
    },
  },
  {
    // fill-picker is vendored from amplo (amplo.ale.design) and tracks its
    // upstream: linting it to this project's taste would mean re-fixing every
    // sync, and the diff noise would hide real findings in our own code
    files: ["src/components/ui/fill-picker/**"],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/naming-convention": "off",
      "no-shadow": "off",
      // upstream writes `import { type Foo }` with inline type specifiers and
      // keeps its own import placement; auto-fixing that would rewrite nearly
      // every file in the folder and conflict on the next sync
      "import/consistent-type-specifier-style": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "import/first": "off",
    },
  },
  {
    ignores: ["eslint.config.js", ".prettierrc"],
  },
]

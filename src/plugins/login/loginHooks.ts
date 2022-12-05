/**
 * Hooks that require authentication before execution
 */
export const loginHooks = [
  "deploy:list:list",
  "deploy:deploy",
  "deploy:apim:apim",
  "deploy:swap:swap",
  "invoke:invoke",
  "rollback:rollback",
  "remove:remove",
  "info:info",
  "invoke:apim:apim",
]

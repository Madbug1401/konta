// Superfície pública do Tool Registry — só isto deve ser importado por fora
// de src/lib/ai/tools/. Nenhum ficheiro em ./tools/tools/ (as 7 tools) deve
// ser importado diretamente por outro módulo; `getTool`/`listTools` são a
// única forma de as descobrir.
export { getAnthropicToolDefinitions } from "./anthropic-adapter";
export {
  cancelConfirmation,
  consumeConfirmation,
  createConfirmation,
  type CancelResult,
  type ConfirmationStatus,
  type ConsumeFailureReason,
  type ConsumeResult,
  type CreateConfirmationInput,
  type PendingConfirmation,
  type PendingToolCall,
} from "./confirmation-store";
export { executeConfirmedTool, executeTool } from "./executor";
export { getTool, listTools } from "./registry";
export {
  RISK_TIERS,
  ToolExecutionError,
  type AiTool,
  type PermissionDecision,
  type RiskTier,
  type ToolExecutionResult,
} from "./types";

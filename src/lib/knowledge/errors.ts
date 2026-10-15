export class KnowledgeInputError extends Error {}

export function knowledgeFailureMessage(error: unknown): string {
  return error instanceof KnowledgeInputError ? error.message : 'Knowledge service unavailable. Please try again or contact your administrator.';
}

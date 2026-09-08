export type SolidAccessState =
  | 'unknown'
  | 'checking'
  | 'writable'
  | 'read-only'
  | 'unavailable'
  | 'rate-limited';

export interface SolidAccessDecision {
  state: SolidAccessState;
  retryAt?: Date;
}

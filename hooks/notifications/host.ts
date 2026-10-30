/**
 * Herdr and Rex deliver their own notifications and sounds from the agent
 * status they track. Inside either, the harness notification consumers stay
 * silent; they are the fallback for other terminals.
 */
export function isManagedTerminal(env: NodeJS.ProcessEnv): boolean {
  return env.HERDR_ENV === "1" || Boolean(env.REX_SESSION);
}

import type { ApplicationProfile } from './application-profile';

export type AgentHandoff = {
  version: 1;
  createdAt: string;
  job: {
    company: string;
    role: string;
    officialUrl: string;
  };
  profile: ApplicationProfile;
};

export const agentHandoffStorageKey = 'job-pilot.agent-handoff.v1';

export function prepareAgentHandoff(
  job: AgentHandoff['job'],
  profile: ApplicationProfile,
): AgentHandoff {
  const handoff: AgentHandoff = {
    version: 1,
    createdAt: new Date().toISOString(),
    job,
    profile,
  };
  window.localStorage.setItem(agentHandoffStorageKey, JSON.stringify(handoff));
  return handoff;
}

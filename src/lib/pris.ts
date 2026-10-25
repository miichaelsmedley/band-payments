/** Verified source types; no access to PRIS is made by this app yet. */
export type PrisReference = {
  workspaceId: number;
  gigId: number;
  contactId: string;
};
export interface PrisIdentityAdapter {
  verifyIdentity(
    session: unknown,
  ): Promise<{ subject: string; issuer: string; expiresAt: string }>;
  currentBandMembership(
    subject: string,
    workspaceId: number,
  ): Promise<{ allowed: boolean; role: string }>;
  gig(
    subject: string,
    workspaceId: number,
    gigId: number,
  ): Promise<{ id: number; title: string; gigDate: string }>;
  person(
    subject: string,
    workspaceId: number,
    contactId: string,
  ): Promise<{ id: string; name: string }>;
}
export const prisIntegrationStatus = "not_connected" as const;

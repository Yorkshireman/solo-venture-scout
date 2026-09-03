/**
 * @typedef {{
 *   envelopeVersion: string;
 *   requestId: string;
 *   command: "reservePublicResearch";
 *   payload: {
 *     campaignPath: string;
 *     coordinatorId: string;
 *     reservedAt: string;
 *     reservation: {
 *       id: string;
 *       sourceUnits: number;
 *       purpose: string;
 *       retrievalRoute: string;
 *       researchClass?: "deepening" | "open-world-discovery";
 *       opportunityId?: string;
 *       approvalId?: string;
 *       decisionValuePriorityId?: string;
 *     };
 *   };
 * }} PublicResearchReservationCommand
 */

/**
 * @typedef {{
 *   envelopeVersion?: string;
 *   requestId?: string;
 *   payload?: Partial<Omit<PublicResearchReservationCommand["payload"], "reservation">> & {
 *     reservation?: Partial<PublicResearchReservationCommand["payload"]["reservation"]>;
 *   };
 * }} PublicResearchReservationOverrides
 */

/**
 * @param {string} campaignPath
 * @param {PublicResearchReservationOverrides} [overrides]
 * @returns {PublicResearchReservationCommand}
 */
export function publicResearchReservationCommand(
  campaignPath,
  overrides = {},
) {
  const { payload: _payload, ...commandOverrides } = overrides;
  const reservation = {
    id: "research-reservation-1",
    sourceUnits: 1,
    purpose: "Examine one public Source",
    retrievalRoute: "public-web-search",
    ...overrides.payload?.reservation,
  };
  return {
    envelopeVersion: "0.1.0",
    requestId: "reserve-public-source-1",
    command: "reservePublicResearch",
    ...commandOverrides,
    payload: {
      campaignPath,
      coordinatorId: "coordinator-primary",
      reservedAt: "2026-09-01T09:12:00.000Z",
      ...overrides.payload,
      reservation,
    },
  };
}

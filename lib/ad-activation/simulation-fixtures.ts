import "server-only";

import type {
  AdActivationPreSendValidation,
  ClaimedAdActivationDelivery,
} from "@/lib/ad-activation/delivery-queue";
import type { AdActivationProviderDryRun } from "@/lib/ad-activation/provider-dry-run";
import { buildGoogleDataManagerDryRun } from "@/lib/ad-activation/providers/google-data-manager";
import { buildMetaCustomAudienceDryRun } from "@/lib/ad-activation/providers/meta-custom-audience";
import type { AdActivationWorkerSimulationDependencies } from "@/lib/ad-activation/worker-simulation";

const EMAIL_HASH = "a".repeat(64);
const PHONE_HASH = "b".repeat(64);

export type AdActivationSimulationFixtureName =
  | "meta_add_ready"
  | "google_remove_ready"
  | "privacy_rejected"
  | "preparation_skipped";

type FixtureDefinition = {
  delivery: ClaimedAdActivationDelivery;
  validation: AdActivationPreSendValidation;
  prepared: AdActivationProviderDryRun;
};

function delivery(
  suffix: string,
  action: "add" | "remove",
): ClaimedAdActivationDelivery {
  return {
    outbox_id: `fixture-outbox-${suffix}`,
    lease_token: `fixture-lease-${suffix}`,
    organization_id: "fixture-org-001",
    destination_id: `fixture-destination-${suffix}`,
    audience_id: `fixture-audience-${suffix}`,
    person_id: `fixture-person-${suffix}`,
    lead_id: `fixture-lead-${suffix}`,
    membership_id: `fixture-membership-${suffix}`,
    action,
    safe_metadata: {
      courseId: "fixture-course-200h",
      courseName: "Fixture 200 Hour YTT",
      location: "Fixture Mysore",
      stage: "qualified",
      intent: "high",
      source: "fixture",
      medium: "simulation",
      campaign: "fixture-multichannel",
    },
    attempt_number: 1,
  };
}

function valid(deliveryItem: ClaimedAdActivationDelivery): AdActivationPreSendValidation {
  return {
    valid: true,
    reason: "eligible",
    action: deliveryItem.action,
    organization_id: deliveryItem.organization_id,
    destination_id: deliveryItem.destination_id,
    audience_id: deliveryItem.audience_id,
    person_id: deliveryItem.person_id,
    lead_id: deliveryItem.lead_id,
    membership_id: deliveryItem.membership_id,
    privacy: {
      advertising: true,
      personalization: true,
      marketing: true,
      blockAdExports: false,
    },
    lease_expires_at: "2026-10-31T06:30:00.000Z",
  };
}

const metaDelivery = delivery("meta-add", "add");
const googleDelivery = delivery("google-remove", "remove");
const privacyDelivery = delivery("privacy-rejected", "add");
const skippedDelivery = delivery("preparation-skipped", "add");

export const AD_ACTIVATION_SIMULATION_FIXTURES: Readonly<
  Record<AdActivationSimulationFixtureName, FixtureDefinition>
> = Object.freeze({
  meta_add_ready: {
    delivery: metaDelivery,
    validation: valid(metaDelivery),
    prepared: {
      status: "ready",
      provider: "meta",
      connectionId: "fixture-meta-connection",
      operations: buildMetaCustomAudienceDryRun({
        audienceId: "123456789",
        action: "add",
        identifiers: {
          emailsSha256: [EMAIL_HASH],
          phonesSha256: [PHONE_HASH],
        },
      }),
    },
  },
  google_remove_ready: {
    delivery: googleDelivery,
    validation: valid(googleDelivery),
    prepared: {
      status: "ready",
      provider: "google",
      connectionId: "fixture-google-connection",
      operation: buildGoogleDataManagerDryRun({
        audienceId: "987654321",
        operatingAccountId: "123-456-7890",
        action: "remove",
        identifiers: {
          emailsSha256: [EMAIL_HASH],
          phonesSha256: [PHONE_HASH],
        },
        customerMatchTermsAccepted: true,
      }),
    },
  },
  privacy_rejected: {
    delivery: privacyDelivery,
    validation: {
      valid: false,
      reason: "advertising_not_granted",
      action: privacyDelivery.action,
      organization_id: privacyDelivery.organization_id,
      destination_id: privacyDelivery.destination_id,
      audience_id: privacyDelivery.audience_id,
      person_id: privacyDelivery.person_id,
      lead_id: privacyDelivery.lead_id,
      membership_id: privacyDelivery.membership_id,
      privacy: {
        advertising: false,
        personalization: true,
        marketing: true,
        blockAdExports: false,
      },
    },
    prepared: { status: "skipped", reason: "pre_send_validation_failed" },
  },
  preparation_skipped: {
    delivery: skippedDelivery,
    validation: valid(skippedDelivery),
    prepared: { status: "skipped", reason: "no_exportable_identifiers" },
  },
});

export function createAdActivationSimulationFixtureDependencies(
  names: readonly AdActivationSimulationFixtureName[],
): AdActivationWorkerSimulationDependencies {
  const selected = names.map((name) => AD_ACTIVATION_SIMULATION_FIXTURES[name]);
  const byOutboxId = new Map(selected.map((fixture) => [fixture.delivery.outbox_id, fixture]));

  return {
    async claimDeliveries({ limit }) {
      return selected.slice(0, Math.max(0, limit)).map((fixture) => ({ ...fixture.delivery }));
    },
    async validateBeforeSend(deliveryItem) {
      const fixture = byOutboxId.get(deliveryItem.outbox_id);
      if (!fixture) {
        return { valid: false, reason: "fixture_not_found" };
      }
      return { ...fixture.validation };
    },
    async prepareAfterValidation(deliveryItem) {
      const fixture = byOutboxId.get(deliveryItem.outbox_id);
      return fixture?.prepared ?? { status: "skipped", reason: "fixture_not_found" };
    },
  };
}

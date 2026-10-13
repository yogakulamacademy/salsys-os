import "server-only";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  assessMetaConversionRouteReadiness,
  type MetaRouteReadiness,
} from "@/lib/conversion-feedback/meta-route-readiness";


const META_DESTINATION_KIND =
  "meta_dataset_event";


type ActivatedRouteRow = {
  id: string;
  organization_id: string;
  status: string;
  destination_kind: string;
  destination_external_id: string | null;
  destination_event_name: string | null;
  updated_at: string;
};


export type MetaRouteActivationResult =
  | {
      activated: false;
      readiness: MetaRouteReadiness;
      route: null;
    }
  | {
      activated: true;
      readiness: MetaRouteReadiness;
      route: {
        id: string;
        organizationId: string;
        status: "active";
        destinationKind: "meta_dataset_event";
        datasetId: string;
        eventName: string;
        updatedAt: string;
      };
    };


function requiredId(
  value: string,
  label: string,
) {
  const trimmed =
    value?.trim();

  if (!trimmed) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return trimmed;
}


export async function activateMetaConversionRoute({
  organizationId,
  routeId,
}: {
  organizationId: string;
  routeId: string;
}): Promise<MetaRouteActivationResult> {
  const normalizedOrganizationId =
    requiredId(
      organizationId,
      "Organization ID",
    );

  const normalizedRouteId =
    requiredId(
      routeId,
      "Meta conversion route ID",
    );


  const readiness =
    await assessMetaConversionRouteReadiness({
      organizationId:
        normalizedOrganizationId,
      routeId:
        normalizedRouteId,
    });

  if (!readiness.ready) {
    return {
      activated:
        false,
      readiness,
      route:
        null,
    };
  }


  const admin =
    createAdminClient();

  const {
    data: rawActivated,
    error: activationError,
  } =
    await admin
      .from(
        "conversion_feedback_routes",
      )
      .update({
        status:
          "active",
      })
      .eq(
        "id",
        normalizedRouteId,
      )
      .eq(
        "organization_id",
        normalizedOrganizationId,
      )
      .eq(
        "status",
        "inactive",
      )
      .eq(
        "destination_kind",
        META_DESTINATION_KIND,
      )
      .select(
        "id,organization_id,status,destination_kind,destination_external_id,destination_event_name,updated_at",
      )
      .maybeSingle();

  if (activationError) {
    throw new Error(
      `Unable to activate Meta conversion route: ${activationError.message}`,
    );
  }

  const activated =
    rawActivated as unknown as
      | ActivatedRouteRow
      | null;

  if (!activated) {
    throw new Error(
      "Meta conversion route changed after readiness verification and was not activated.",
    );
  }

  if (
    activated.status !==
      "active" ||
    activated.destination_kind !==
      META_DESTINATION_KIND ||
    !activated.destination_external_id ||
    !activated.destination_event_name
  ) {
    throw new Error(
      "Meta conversion route activation returned an unexpected route state.",
    );
  }


  return {
    activated:
      true,
    readiness,
    route: {
      id:
        activated.id,
      organizationId:
        activated.organization_id,
      status:
        "active",
      destinationKind:
        "meta_dataset_event",
      datasetId:
        activated.destination_external_id,
      eventName:
        activated.destination_event_name,
      updatedAt:
        activated.updated_at,
    },
  };
}

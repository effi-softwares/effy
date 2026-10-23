// The facts `packageStatus` needs, for many packages in one round trip, shared by orders, shop and
// driver. A package can be on several rounds over its life; the latest row of each kind describes now.

export const PACKAGE_STATUS_FACTS = `
  SELECT sf.id::text                                   AS package_id,
         sf.status                                     AS shop_status,
         col.state                                     AS collection_state,
         col.driver_name                               AS collection_driver,
         COALESCE(col.checked_in, false)               AS checked_in_at_hub,
         del.state                                     AS delivery_state,
         del.stop_status                               AS delivery_stop_status,
         del.driver_name                               AS delivery_driver,
         fail.reason                                   AS failed_reason,
         EXISTS (SELECT 1 FROM public.carrier_handoff ch WHERE ch.shop_fulfillment_id = sf.id) AS handed_to_carrier,
         EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = sf.id) AS arrived,
         -- An OPEN courier problem on the live consignment: its latest step is failed, lost,
         -- damaged or returned (a later resolved or delivered closes it, and moves the state on).
         (SELECT c.state FROM public.courier_consignment c
           WHERE c.shop_fulfillment_id = sf.id AND c.state IN ('failed', 'lost', 'damaged', 'returned')) AS courier_problem,
         -- Bags of this package a driver declared missing that nobody has decided yet.
         (SELECT count(*) FROM public.package_hold ph
           WHERE ph.shop_fulfillment_id = sf.id AND ph.parcel_id IS NOT NULL AND ph.resolution IS NULL)::int AS bags_held
    FROM public.shop_fulfillment sf
    LEFT JOIN LATERAL (
      SELECT rp.state, d.name AS driver_name,
             EXISTS (SELECT 1 FROM public.hub_checkin hc WHERE hc.round_id = dr.id) AS checked_in
        FROM public.round_package rp
        JOIN public.round_stop   rs ON rs.id = rp.stop_id
        JOIN public.driver_round dr ON dr.id = rs.round_id AND dr.kind = 'collection'
        JOIN public.driver        d ON d.id = dr.driver_id
       WHERE rp.shop_fulfillment_id = sf.id
       ORDER BY rp.created_at DESC, rp.id DESC
       LIMIT 1
    ) col ON TRUE
    LEFT JOIN LATERAL (
      SELECT rp.state, rs.status AS stop_status, d.name AS driver_name
        FROM public.round_package rp
        JOIN public.round_stop   rs ON rs.id = rp.stop_id
        JOIN public.driver_round dr ON dr.id = rs.round_id AND dr.kind = 'delivery'
        JOIN public.driver        d ON d.id = dr.driver_id
       WHERE rp.shop_fulfillment_id = sf.id
       ORDER BY rp.created_at DESC, rp.id DESC
       LIMIT 1
    ) del ON TRUE
    LEFT JOIN LATERAL (
      -- An unresolved failed attempt that no later proof superseded.
      SELECT f.reason
        FROM public.delivery_attempt_failure f
        JOIN public.round_package rp ON rp.stop_id = f.stop_id AND rp.shop_fulfillment_id = sf.id
       WHERE f.resolved_at IS NULL
         AND NOT EXISTS (
               SELECT 1 FROM public.delivery_proof p
                 JOIN public.round_package rp2 ON rp2.stop_id = p.stop_id AND rp2.shop_fulfillment_id = sf.id
                WHERE p.captured_at >= f.failed_at)
       ORDER BY f.failed_at DESC
       LIMIT 1
    ) fail ON TRUE
   WHERE sf.id = ANY($1::uuid[])
`;

export interface PackageStatusFactsRow {
  package_id: string;
  shop_status: string;
  collection_state: string | null;
  collection_driver: string | null;
  checked_in_at_hub: boolean;
  delivery_state: string | null;
  delivery_stop_status: string | null;
  delivery_driver: string | null;
  failed_reason: string | null;
  handed_to_carrier: boolean;
  arrived: boolean;
  courier_problem: string | null;
  bags_held?: number;
}

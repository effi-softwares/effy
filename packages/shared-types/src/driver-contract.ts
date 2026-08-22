/**
 * The driver-surface wire contract, as a single aggregator (049).
 *
 * So the KMP driver mobile app can generate its Kotlin DTOs from EXACTLY the types it consumes.
 * `driver.ts` remains the single source of truth (Principle II); this file only aggregates, and it is
 * the input to `driver-contract:gen`.
 *
 * The `DriverContract` aggregator forces every referenced type into the schema under `--expose all`
 * (a bare `-t '*'` silently drops types). The admin provisioning DTOs are deliberately NOT here — the
 * mobile app never calls /admin/*.
 */
import type {
  DriverMeDTO,
  DutyRequest,
  DutyResponse,
  LocationRequest,
  TodayDTO,
  TodayItemRef,
  DriverCollectionRunDTO,
  CollectionStopSummary,
  CollectionStopDTO,
  CollectionPackage,
  ManifestLine,
  CollectRequest,
  CollectResponse,
  CollectionIssueRequest,
  HubCheckinRequest,
  HubCheckinResponse,
  DeliveryRunDTO,
  DeliveryDropSummary,
  DeliveryDropDTO,
  DropPackageRef,
  DropStatusRequest,
  DropStatusResponse,
  ProofPresignRequest,
  ProofPresignResponse,
  ProofRequest,
  ProofResponse,
  DropFailRequest,
  DropFailResponse,
  RunMapDTO,
  MapPoint,
  MapStop,
  ContactRequest,
  ContactResponse,
  HistoryDTO,
  HistoryDay,
  HistoryRunRow,
  HistoryDropRow,
  HistoryDetailDTO,
  TimelineEntry,
  ActivityItem,
  ActivityReadRequest,
} from "./driver";
import type { ProblemJSON } from "./problem";

/** Aggregator — codegen entry only. Every field forces a type into the schema. */
export interface DriverContract {
  me: DriverMeDTO;
  dutyRequest: DutyRequest;
  dutyResponse: DutyResponse;
  locationRequest: LocationRequest;
  today: TodayDTO;
  todayItem: TodayItemRef;
  collectionRun: DriverCollectionRunDTO;
  collectionStop: CollectionStopSummary;
  collectionStopDetail: CollectionStopDTO;
  collectionPackage: CollectionPackage;
  manifestLine: ManifestLine;
  collectRequest: CollectRequest;
  collectResponse: CollectResponse;
  collectionIssue: CollectionIssueRequest;
  hubCheckinRequest: HubCheckinRequest;
  hubCheckinResponse: HubCheckinResponse;
  deliveryRun: DeliveryRunDTO;
  deliveryDropSummary: DeliveryDropSummary;
  deliveryDrop: DeliveryDropDTO;
  dropPackage: DropPackageRef;
  dropStatusRequest: DropStatusRequest;
  dropStatusResponse: DropStatusResponse;
  proofPresignRequest: ProofPresignRequest;
  proofPresignResponse: ProofPresignResponse;
  proofRequest: ProofRequest;
  proofResponse: ProofResponse;
  dropFailRequest: DropFailRequest;
  dropFailResponse: DropFailResponse;
  runMap: RunMapDTO;
  mapPoint: MapPoint;
  mapStop: MapStop;
  contactRequest: ContactRequest;
  contactResponse: ContactResponse;
  history: HistoryDTO;
  historyDay: HistoryDay;
  historyRun: HistoryRunRow;
  historyDrop: HistoryDropRow;
  historyDetail: HistoryDetailDTO;
  timelineEntry: TimelineEntry;
  activityItem: ActivityItem;
  activityRead: ActivityReadRequest;
  problem: ProblemJSON;
}

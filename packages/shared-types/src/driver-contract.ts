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
  TodayDTO,
  TodayItemRef,
  UpcomingRound,
  RoundOpening,
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
  ParcelReturnRequest,
  ParcelReturnResponse,
  LoadRequest,
  LoadResponse,
  RunMapDTO,
  RunMapPoint,
  RunMapStop,
  TodayProgress,
  ReturnParcel,
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
  DriverVehicleCheckState,
  VehicleCheckEntry,
  VehicleCheckRequest,
  VehicleCheckResponse,
  LoadStep,
  PackageRefOnly,
  NotLoadedPackage,
} from "./driver";
import type { ProblemJSON } from "./problem";

/** Aggregator — codegen entry only. Every field forces a type into the schema. */
export interface DriverContract {
  me: DriverMeDTO;
  dutyRequest: DutyRequest;
  dutyResponse: DutyResponse;
  today: TodayDTO;
  todayItem: TodayItemRef;
  upcomingRound: UpcomingRound;
  roundOpening: RoundOpening;
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
  parcelReturnRequest: ParcelReturnRequest;
  parcelReturnResponse: ParcelReturnResponse;
  loadRequest: LoadRequest;
  loadResponse: LoadResponse;
  runMap: RunMapDTO;
  runMapPoint: RunMapPoint;
  runMapStop: RunMapStop;
  todayProgress: TodayProgress;
  returnParcel: ReturnParcel;
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
  vehicleCheckState: DriverVehicleCheckState;
  vehicleCheckEntry: VehicleCheckEntry;
  vehicleCheckRequest: VehicleCheckRequest;
  vehicleCheckResponse: VehicleCheckResponse;
  loadStep: LoadStep;
  packageRef: PackageRefOnly;
  notLoadedPackage: NotLoadedPackage;
  problem: ProblemJSON;
}

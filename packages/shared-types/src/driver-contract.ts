/**
 * The driver-surface wire contract: the aggregator the driver app's Kotlin DTOs are generated from
 * (`driver-contract:gen`). `DriverContract` forces every referenced type into the schema under
 * `--expose all`. No admin provisioning DTOs: the app never calls /admin/*.
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
  DriverVehicleCheckState,
  VehicleCheckEntry,
  VehicleCheckRequest,
  VehicleCheckResponse,
  LoadStep,
  ParcelsUnaccountedProblem,
} from "./driver";
import type { LabelReadDTO, ParcelDTO, ParcelHandover, ParcelMissing } from "./parcels";
import type { ProblemJSON } from "./problem";

/** Codegen entry only. Every field forces a type into the schema. */
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
  vehicleCheckState: DriverVehicleCheckState;
  vehicleCheckEntry: VehicleCheckEntry;
  vehicleCheckRequest: VehicleCheckRequest;
  vehicleCheckResponse: VehicleCheckResponse;
  loadStep: LoadStep;
  parcel: ParcelDTO;
  parcelHandover: ParcelHandover;
  parcelMissing: ParcelMissing;
  labelRead: LabelReadDTO;
  parcelsUnaccounted: ParcelsUnaccountedProblem;
  problem: ProblemJSON;
}

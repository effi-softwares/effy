// @effy/web-kit/scanner — reading bag labels in the web consoles (096): a handheld scanner, the camera, or
// a typed code. The judgement of a read is the shared scan rule (`judgeRead` in @effy/shared-types).
export { ScanField, type ScanFieldProps, type ScanMethod } from "./ScanField"
export { createWedge, normaliseScan, type WedgeKey, type WedgeOptions } from "./wedge"
export { cameraAvailable, startCamera } from "./camera"

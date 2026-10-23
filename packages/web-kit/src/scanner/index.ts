// Reading bag labels in the web consoles: a handheld scanner, the camera or a typed code, judged by `judgeRead` (@effy/shared-types).
export { ScanField, type ScanFieldProps, type ScanMethod } from "./ScanField"
export { createWedge, normaliseScan, type WedgeKey, type WedgeOptions } from "./wedge"
export { cameraAvailable, startCamera } from "./camera"

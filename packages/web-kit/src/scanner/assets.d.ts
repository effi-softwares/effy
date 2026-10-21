// Vite turns `?url` imports into the URL of a file it emits with the app (self-hosted, hashed).
declare module "*?url" {
  const url: string
  export default url
}

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// One stable router object, as Next's own `useRouter` returns: the component's effect depends on it.
const refresh = vi.fn()
const router = { refresh }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

import { LiveRefresh } from "./LiveRefresh"

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  sent: Array<Record<string, unknown>> = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeWebSocket.instances.push(this)
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>)
  }
  close() {
    this.closed = true
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  subscription() {
    return this.sent.filter((m) => m.type === "subscribe").at(-1)!
  }
}

const descriptor = () => ({
  httpHost: "x.appsync-api.example",
  realtimeHost: "x.appsync-realtime-api.example",
  channelPrefix: "/customer/sub-1",
  epochSeconds: 600,
  serverTime: new Date(Date.now()).toISOString(),
})

function answer(status: number, body?: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status })),
  )
}

async function goLive(): Promise<FakeWebSocket> {
  await act(() => vi.advanceTimersByTimeAsync(0))
  const socket = FakeWebSocket.instances.at(-1)!
  await act(async () => {
    socket.onopen?.()
    socket.receive({ type: "connection_ack", connectionTimeoutMs: 300_000 })
    await vi.advanceTimersByTimeAsync(0)
    socket.receive({ type: "subscribe_success", id: socket.subscription().id })
    await vi.advanceTimersByTimeAsync(0)
  })
  return socket
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-05T03:05:00Z"))
  FakeWebSocket.instances = []
  refresh.mockClear()
  vi.stubGlobal("WebSocket", FakeWebSocket)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("LiveRefresh", () => {
  it("opens the customer's own channel with the token the server returned alongside it", async () => {
    answer(200, { descriptor: descriptor(), token: "id-token" })
    render(<LiveRefresh />)
    const socket = await goLive()

    const header = JSON.parse(atob(socket.protocols[1]!.replace(/^header-/, "").replace(/-/g, "+").replace(/_/g, "/")))
    expect(header.Authorization).toBe("id-token")
    expect(socket.subscription().channel).toMatch(/^\/customer\/sub-1\/\d+$/)
  })

  it("asks the server to render the page again when told orders changed", async () => {
    answer(200, { descriptor: descriptor(), token: "id-token" })
    render(<LiveRefresh />)
    const socket = await goLive()
    const before = refresh.mock.calls.length

    await act(async () => {
      socket.receive({ type: "data", id: socket.subscription().id, event: ['{"k":"orders"}'] })
      await vi.advanceTimersByTimeAsync(0)
    })
    // The first update after a quiet spell reads at once… (the connect's own catch-up read counts
    // as the start of a burst, so this one lands within the quiet interval)
    await act(() => vi.advanceTimersByTimeAsync(1_100))
    expect(refresh.mock.calls.length).toBe(before + 1)
  })

  it("does nothing on a timer: an idle hour refreshes nothing", async () => {
    answer(200, { descriptor: descriptor(), token: "id-token" })
    render(<LiveRefresh />)
    const socket = await goLive()
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    const before = refresh.mock.calls.length

    for (let i = 0; i < 120; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
        socket.receive({ type: "ka" })
        socket.receive({ type: "subscribe_success", id: socket.subscription().id })
      })
    }
    expect(refresh.mock.calls.length).toBe(before)
  })

  it("opens nothing and shows nothing when there is no channel (signed out, or none here)", async () => {
    answer(204)
    render(<LiveRefresh />)
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("renders nothing while live", async () => {
    answer(200, { descriptor: descriptor(), token: "id-token" })
    const { container } = render(<LiveRefresh />)
    await goLive()
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(container.textContent).toBe("")
  })

  it("says so, with the page's age and a refresh, when the connection stays lost", async () => {
    answer(200, { descriptor: descriptor(), token: "id-token" })
    render(<LiveRefresh />)
    const socket = await goLive()
    await act(async () => {
      socket.onclose?.()
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(() => vi.advanceTimersByTimeAsync(4_000))
    expect(screen.getByRole("status").textContent).toMatch(/Reconnecting — this page was last updated at \d/)
  })
})

describe("the import quarantine", () => {
  // The package ROOT of @effy/web-kit imports the auth SDK. This app may import only `/live`.
  it("no file in this app imports @effy/web-kit except through /live", () => {
    const source = readFileSync(resolve(__dirname, "LiveRefresh.tsx"), "utf8")
    const imports = [...source.matchAll(/from "(@effy\/web-kit[^"]*)"/g)].map((m) => m[1])
    expect(imports).toEqual(["@effy/web-kit/live"])
  })
})

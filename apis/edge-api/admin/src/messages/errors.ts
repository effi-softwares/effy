// A refusal from the messages routes (contracts/messages-api.md): its status and code become the problem response.
export class MessageError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "MessageError";
  }
}

export function isMessageError(err: unknown): err is MessageError {
  return err instanceof MessageError || (err as MessageError)?.name === "MessageError";
}

export const invalid = (message: string) => new MessageError(400, "invalid_message", message);
export const notFound = () => new MessageError(404, "message_not_found", "message not found");
export const forbiddenFor = (message: string) => new MessageError(403, "forbidden", message);

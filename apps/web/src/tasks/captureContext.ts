export type CaptureDestination = "INBOX" | "TODAY" | "PROJECT";

export interface CaptureContext {
  defaultDestination: CaptureDestination;
  projectId?: string;
}

export function getCaptureContext(pathname: string): CaptureContext {
  if (pathname === "/today") {
    return { defaultDestination: "TODAY" };
  }

  const projectMatch = pathname.match(/^\/projects\/([^/]+)(?:\/(?:board|structure))?$/);
  if (projectMatch?.[1] !== undefined) {
    return {
      defaultDestination: "PROJECT",
      projectId: decodeURIComponent(projectMatch[1]),
    };
  }

  return { defaultDestination: "INBOX" };
}

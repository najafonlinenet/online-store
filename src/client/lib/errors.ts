/** The message a server function's refusal carries, for a toast or an alert. */
export function messageOf(error: unknown): string {
  if (error instanceof Error) {
    try {
      const issues = JSON.parse(error.message) as { message?: string }[];
      if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
    } catch {
      // Not a validation list.
    }
    return error.message;
  }
  return "That didn't work. Try again.";
}

export function isAccessDenied(error: unknown): boolean {
  return error instanceof Error && error.message.includes("don't have access");
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

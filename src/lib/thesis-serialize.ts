import type { IThesisPoint } from "@/models/ThesisPoint";

/** Shared shape sent to the frontend for a single thesis point. */
export function serializeThesisPoint(d: IThesisPoint) {
  return {
    id: d._id.toString(),
    text: d.text,
    direction: d.direction,
    status: d.status,
    createdAt: d.createdAt,
  };
}

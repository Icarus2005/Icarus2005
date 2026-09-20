import { redirect } from "next/navigation";

// Sprint 06E ships one capture flow (event capture). /capture redirects to
// it rather than duplicating a picker for a single option.
export default function CapturePage() {
  redirect("/capture/event");
}

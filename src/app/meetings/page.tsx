import { Radio } from "lucide-react";
import MeetingsInbox from "./MeetingsInbox";

export const metadata = { title: "Meetings · ArqOne CRM" };

export default function MeetingsPage() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Call transcripts are triaged automatically — only genuine sales conversations become proposals.
        </p>
      </div>

      <div className="card p-4 mb-6 flex items-start gap-3 bg-brand-50/40 border-brand-100">
        <Radio size={16} className="text-brand-500 mt-0.5 shrink-0" aria-hidden />
        <p className="text-sm text-gray-600">
          Point your meeting recorder (Fathom, Fireflies, Zoom) at{" "}
          <code className="text-xs bg-white px-1.5 py-0.5 rounded border border-gray-200">
            POST /api/meetings/ingest
          </code>{" "}
          to capture calls automatically. Set <code className="text-xs">MEETING_WEBHOOK_SECRET</code> and send it
          as <code className="text-xs">X-Webhook-Secret</code>.
        </p>
      </div>

      <MeetingsInbox />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type TeamMember = { id: string; name: string; role: string; active: boolean };

// Form-friendly team member dropdown. Submits the selected id as `ownerId`.
// Controlled internally because options load async — a plain defaultValue
// would be dropped when the option list arrives after mount.
export default function OwnerSelect({ defaultValue }: { defaultValue?: string | null }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((list: TeamMember[]) => setMembers(list.filter((m) => m.active)))
      .catch(() => {});
  }, []);

  return (
    <select
      name="ownerId"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className="input"
    >
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
}

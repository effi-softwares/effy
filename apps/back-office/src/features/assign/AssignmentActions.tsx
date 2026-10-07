import { useState } from "react";

import { Button, toast } from "@effy/design-system/ui";
import type { OrderAssignment } from "@effy/shared-types";

import { AssignSheet } from "./AssignSheet";
import { assignErrorLine, useUnassign } from "./queries";
import type { Stage } from "./repo";

/**
 * The two buttons beside an assignment line (073): "Assign to…" (also how a package is moved) and
 * "Unassign". Nothing is offered once the goods are in a van — the line already says so.
 */
export function AssignmentActions({
  packageId,
  stage,
  assignment,
  title,
}: {
  packageId: string;
  stage: Stage;
  assignment: OrderAssignment;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const unassign = useUnassign(packageId);
  if (!assignment.movable) return null;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {assignment.driver ? "Change driver" : "Assign to…"}
      </Button>
      {assignment.assignmentId ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={unassign.isPending}
          onClick={() =>
            unassign.mutate(
              { stage, expectedAssignmentId: assignment.assignmentId! },
              { onSuccess: (r) => toast(r.message), onError: (e) => toast(assignErrorLine(e).line) },
            )
          }
        >
          Unassign
        </Button>
      ) : null}
      {open ? (
        <AssignSheet
          open={open}
          onOpenChange={setOpen}
          packageId={packageId}
          stage={stage}
          expectedAssignmentId={assignment.assignmentId}
          title={title}
        />
      ) : null}
    </div>
  );
}

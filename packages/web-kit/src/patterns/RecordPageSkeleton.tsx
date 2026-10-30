import type { LucideIcon } from "lucide-react";

import type { HeaderBack } from "../console/StaffHeader";
import { Bone, BoneLines, Loading } from "./Skeletons";
import { InspectorSection, RecordFacts, RecordHeader, RecordNav, RecordPage, RecordSection } from "./Record";

/**
 * A record page while it reads (a product, an order), drawn from the page's own record parts: the head, the facts row
 * with its labels written out, the section navigator, each section's head, and the inspector's titles - a bone where
 * a value goes.
 */
export function RecordPageSkeleton({
  label,
  railTitle,
  back,
  facts,
  sections,
  rail,
  fixedRail = false,
}: {
  /** Said to assistive tech while it reads ("Loading order"). */
  label: string;
  railTitle: string;
  back: HeaderBack;
  fixedRail?: boolean;
  facts: readonly string[];
  sections: readonly { id: string; icon: LucideIcon; title: string }[];
  rail: readonly string[];
}) {
  return (
    <Loading label={label}>
      <RecordPage
        fixedRail={fixedRail}
        railTitle={railTitle}
        rail={rail.map((title) => (
          <InspectorSection key={title} title={title}>
            <BoneLines count={3} />
          </InspectorSection>
        ))}
      >
        <RecordHeader
          back={back}
          media={<Bone kind="block" className="size-full rounded-none" />}
          eyebrow={<Bone kind="small" className="w-48" />}
          title={<Bone kind="title" className="w-80 max-w-full" />}
          meta={<Bone kind="small" className="w-64" />}
          actions={
            <>
              <Bone kind="control" className="w-36" />
              <Bone kind="control" className="w-28" />
            </>
          }
        />
        <RecordFacts
          facts={facts.map((label) => ({ key: label, label, value: <Bone className="w-24" />, note: <Bone kind="small" className="w-32" /> }))}
        />
        <RecordNav items={sections.map((s) => ({ id: `${s.id}-loading`, label: s.title }))} />
        {sections.map((s, i) => (
          <RecordSection key={s.id} id={`${s.id}-loading`} icon={s.icon} title={s.title} description={<Bone kind="small" className="w-80 max-w-full" />}>
            {i === 0 ? <Bone kind="block" className="h-72" /> : <BoneLines count={3} className="max-w-xl" />}
          </RecordSection>
        ))}
      </RecordPage>
    </Loading>
  );
}

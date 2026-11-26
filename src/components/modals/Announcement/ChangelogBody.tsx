import ExpandableCard from "../../ui/ExpandableCard";

const ListStyle = "list-disc list-inside space-y-1 text-endfield-text";

interface ChangelogSection {
  version?: string;
  title?: string;
  defaultOpen?: boolean;
  items?: string[];
}

export interface ChangelogBodyProps {
  sections?: ChangelogSection[];
}

export default function ChangelogBody({ sections = [] }: ChangelogBodyProps) {
  return (
    <div className="space-y-2">
      {sections.map((section, index) => (
        <ExpandableCard
          key={`${section.version}-${index}`}
          version={section.version}
          title={section.title}
          defaultOpen={section.defaultOpen}
        >
          <ul className={ListStyle}>
            {(section.items || []).map((item, itemIndex) => (
              <li key={`${section.version}-${itemIndex}`}>{item}</li>
            ))}
          </ul>
        </ExpandableCard>
      ))}
    </div>
  );
}

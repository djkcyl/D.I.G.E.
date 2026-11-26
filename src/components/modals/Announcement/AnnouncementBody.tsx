import { SITE_CONFIG } from "../../../config/site";

const LinkStyle =
  "text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2 transition-colors";
const HeadingStyle = "text-endfield-yellow font-bold mt-4 mb-2";
const ListStyle = "list-disc list-inside space-y-1 text-endfield-text";

const CONTENT_LINKS: Record<string, string> = {
  tutorial: SITE_CONFIG.tutorialUrl,
  github: SITE_CONFIG.repoUrl,
  issues: SITE_CONFIG.issuesUrl,
  upstream: "https://github.com/djkcyl/D.I.G.E.",
};

interface ContentSegment {
  text: string;
  link?: string;
}

function RenderContentSegments({
  segments = [],
  blockIndex,
}: {
  segments?: ContentSegment[];
  blockIndex: number;
}) {
  return segments.map((segment, segmentIndex) => {
    const key = `${blockIndex}-${segmentIndex}`;
    const href = segment.link ? CONTENT_LINKS[segment.link] : null;
    if (href) {
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={LinkStyle}
        >
          {segment.text}
        </a>
      );
    }
    return <span key={key}>{segment.text}</span>;
  });
}

interface AnnouncementBlock {
  type: string;
  text?: string;
  items?: string[];
  className?: string;
  segments?: ContentSegment[];
}

export interface AnnouncementBodyProps {
  blocks?: AnnouncementBlock[];
}

function blockKey(_block: AnnouncementBlock, index: number): string {
  return `block-${index}`;
}

export default function AnnouncementBody({
  blocks = [],
}: AnnouncementBodyProps) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3 key={blockKey(block, index)} className={HeadingStyle}>
              {block.text}
            </h3>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={blockKey(block, index)} className={ListStyle}>
              {(block.items || []).map((item) => (
                <li key={`${blockKey(block, index)}-${item}`}>{item}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p
              key={blockKey(block, index)}
              className={block.className || "mb-3"}
            >
              {block.segments ? (
                <RenderContentSegments
                  segments={block.segments}
                  blockIndex={index}
                />
              ) : (
                block.text
              )}
            </p>
          );
        }

        return null;
      })}
    </>
  );
}

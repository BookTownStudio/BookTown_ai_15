import { type CollaborativeCursorOverlay } from '../../lib/editor/writeCollaborationTypes.ts';

interface CollaborativeCursorLayerProps {
  cursors: CollaborativeCursorOverlay[];
}

export default function CollaborativeCursorLayer({ cursors }: CollaborativeCursorLayerProps) {
  if (cursors.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
      {cursors.map((cursor) => (
        <div
          key={cursor.key}
          className="absolute flex -translate-x-0.5 items-start"
          style={{
            top: cursor.top,
            left: cursor.left,
          }}
        >
          <div
            className="w-0.5 rounded-full"
            style={{
              height: cursor.height,
              backgroundColor: cursor.color,
            }}
          />
          <div
            className="ml-1 max-w-[120px] truncate rounded-sm px-1.5 py-0.5 text-[10px] font-medium leading-4 text-white shadow-sm"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.displayName}
          </div>
        </div>
      ))}
    </div>
  );
}

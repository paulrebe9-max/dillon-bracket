'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Team } from '@/lib/supabase';

function SortableTeam({ team, rank }: { team: Team; rank: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`team-card ${isDragging ? 'dragging' : ''}`}
    >
      <div className={`rank-badge rank-${rank}`}>{rank}</div>
      <span className="text-2xl">{team.flag_emoji}</span>
      <span className="font-semibold text-gray-800 flex-1">{team.name}</span>
      <span className="text-xs text-gray-400">#{team.fifa_ranking}</span>
      <span className="text-gray-300 text-lg">⠿</span>
    </div>
  );
}

export default function GroupStage({
  teams,
  groupName,
  onSave,
  savedOrder,
}: {
  teams: Team[];
  groupName: string;
  onSave: (groupName: string, orderedTeams: Team[]) => void;
  savedOrder: Team[] | null;
}) {
  const [items, setItems] = useState<Team[]>(savedOrder || teams);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((t) => t.id === active.id);
        const newIndex = prev.findIndex((t) => t.id === over.id);
        const newOrder = arrayMove(prev, oldIndex, newIndex);
        onSave(groupName, newOrder);
        return newOrder;
      });
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800">Group {groupName}</h3>
        <div className="flex gap-2">
          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-full font-medium">
            1st advances
          </span>
          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-full font-medium">
            2nd advances
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
        <span>⠿</span> Drag teams to set your predicted finishing order
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {items.map((team, index) => (
              <SortableTeam key={team.id} team={team} rank={index + 1} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block"></span>
            Advances automatically
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-gray-200 inline-block"></span>
            May advance (best 3rd)
          </span>
        </div>
      </div>
    </div>
  );
}

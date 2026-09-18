import type { ActivityType } from "@/modules/audit/service";

interface ActivityRow {
  id: string;
  type: string;
  createdAt: Date;
  metadata: unknown;
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  CONTACT_CREATED: "Contact creado",
  CONTACT_UPDATED: "Contact editado",
  CONTACT_IDENTIFIED: "Contact identificado",
  CASE_CREATED: "Case creado",
  CASE_ASSIGNED: "Case asignado",
  CASE_STATUS_CHANGED: "Estado del case cambiado",
  TASK_CREATED: "Task creada",
  TASK_COMPLETED: "Task completada",
  MESSAGE_RECEIVED: "Mensaje recibido",
  MESSAGE_SENT: "Mensaje enviado",
  CONVERSATION_REASSIGNED: "Conversación reasignada",
  CHANNEL_CONNECTED: "Canal conectado",
  CHANNEL_DISCONNECTED: "Canal desconectado",
};

function labelFor(type: string): string {
  return ACTIVITY_LABELS[type as ActivityType] ?? type;
}

/** Read-only activity history embedded in Contact/Case detail pages. */
export function ActivityFeed({ activities }: { activities: ActivityRow[] }) {
  return (
    <div>
      <h2 className="text-sm font-medium text-zinc-700">Historial</h2>
      {activities.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">Sin actividad todavía.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {activities.map((activity) => (
            <li key={activity.id} className="flex justify-between border-b border-zinc-100 py-1.5">
              <span>{labelFor(activity.type)}</span>
              <span className="text-zinc-400">
                {activity.createdAt.toLocaleString("es-ES")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

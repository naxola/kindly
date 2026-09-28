import type { ActivityType } from "@/modules/audit/service";
import { PageSection } from "@/components/patterns/page-section";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";

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
  CONTACT_DELEGATE_ASSIGNED: "Delegado de referencia cambiado",
  CASE_CREATED: "Case creado",
  CASE_ASSIGNED: "Case asignado",
  CASE_STATUS_CHANGED: "Estado del case cambiado",
  TASK_CREATED: "Task creada",
  TASK_COMPLETED: "Task completada",
  MESSAGE_RECEIVED: "Mensaje recibido",
  MESSAGE_SENT: "Mensaje enviado",
  MESSAGE_SENT_FROM_DEVICE: "Mensaje enviado desde el móvil",
  CONVERSATION_REASSIGNED: "Conversación reasignada",
  CHANNEL_CONNECTED: "Canal conectado",
  CHANNEL_DISCONNECTED: "Canal desconectado",
  MEMBER_INVITED: "Miembro invitado",
  MEMBER_JOINED: "Miembro incorporado",
  INVITATION_REVOKED: "Invitación revocada",
  MEMBER_ROLE_CHANGED: "Rol de miembro cambiado",
  ORGANIZATION_RENAMED: "Organización renombrada",
};

function labelFor(type: string): string {
  return ACTIVITY_LABELS[type as ActivityType] ?? type;
}

/** Read-only activity history embedded in Contact/Case detail pages. */
export function ActivityFeed({ activities }: { activities: ActivityRow[] }) {
  return (
    <PageSection title="Historial">
      {activities.length === 0 ? (
        <EmptyState variant="inline" title="Sin actividad todavía" />
      ) : (
        <ul className="flex flex-col">
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="flex items-center justify-between gap-2 border-b border-border py-2 type-body last:border-0"
            >
              <span className="text-foreground">{labelFor(activity.type)}</span>
              <RelativeTime date={activity.createdAt} className="shrink-0 type-caption text-foreground-lighter" />
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  );
}

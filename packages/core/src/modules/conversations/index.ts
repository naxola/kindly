// Conversations (Kindly): threads and messages of the contacts, fed by the messaging webhooks.
export { isConversationUnread, getServiceWindowState, shouldApplyDeliveryStatus } from './domain.ts'
export type { ServiceWindowState, ServiceWindowStatus, DeliveryStatusValue } from './domain.ts'
export {
  findOrCreateConversation,
  recordMessage,
  applyDeliveryUpdate,
  markConversationReadUpTo,
} from './service.ts'
export type { InboundContactInfo, MessageOrigin, RecordMessageInput } from './service.ts'

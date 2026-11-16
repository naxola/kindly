// Contacts (Kindly CRM): the people the organization serves, who answers for each of them
// and which of them each member may see.
export { ContactInput, ContactCreateInput } from './schemas.ts'
export { contactVisibilityWhere, visibleContactIds } from './visibility.ts'
export {
  listContacts,
  getContact,
  createContact,
  updateContact,
  markContactIdentified,
  listContactActivity,
  assertContactVisible,
  createContactFromInbound,
} from './service.ts'
export type { ContactView, ContactActivityView } from './service.ts'
export { assignContactToDelegate, listAssignmentHistory } from './assignments.ts'
export type { AssignmentView } from './assignments.ts'
export {
  contactWelcomeEmailJob,
  contactWelcomeHandler,
  sendContactWelcome,
  welcomeEmail,
} from './welcome.ts'
export type { WelcomeEmailInput } from './welcome.ts'

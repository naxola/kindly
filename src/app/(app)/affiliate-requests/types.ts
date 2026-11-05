import type { NormalizedAffiliate } from "@/modules/affiliates/normalize";

/** An open request as the client components receive it (dates serialized). */
export interface RequestView {
  id: string;
  receivedAt: string;
  contactId: string | null;
  duplicateOfContactId: string | null;
  duplicateOfName: string | null;
  proposedDelegateId: string | null;
  data: NormalizedAffiliate;
}

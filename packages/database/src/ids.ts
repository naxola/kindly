import { v7 } from 'uuid'

/** UUID v7 (time-ordered). Used when the id is needed before the INSERT. */
export const newId = (): string => v7()

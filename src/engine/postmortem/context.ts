import type { ContextNote, LegSnapshot } from './snapshot'

export interface ContextProvider {
  getContext(snapshot: LegSnapshot): Promise<ContextNote[]>
}

export const noOpContextProvider: ContextProvider = {
  async getContext() {
    return []
  },
}

export async function attachContextNotes(snapshot: LegSnapshot, provider: ContextProvider = noOpContextProvider): Promise<LegSnapshot> {
  const contextNotes = await provider.getContext(snapshot)
  return { ...snapshot, contextNotes }
}

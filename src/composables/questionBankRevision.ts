import { readonly, ref } from 'vue'

const revision = ref(0)

/** Invalidate cached public questions after a confirmed administrator change. */
export const questionBankRevision = readonly(revision)

export function markQuestionBankChanged() {
  revision.value++
}

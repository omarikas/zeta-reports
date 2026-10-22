export function emptyDraft() {
  return {
    title: '',
    where: '',
    body: '',
    severity: 'medium',
    files: [],
  }
}

export function isDirty(draft) {
  return Boolean(
    draft.title.trim() ||
      draft.where.trim() ||
      draft.body.trim() ||
      draft.files.length ||
      draft.severity !== 'medium',
  )
}

export interface LocalApprovalMaterial {
  hash: string
  fileName: string
  mimeType: string
  dataUrl: string
}

const STORAGE_PREFIX = 'goodfund:approval-material:'

function storageKey(hash: string) {
  return `${STORAGE_PREFIX}${hash.toLowerCase()}`
}

export function localApprovalMaterialUri(hash: string) {
  return `local-demo://approval/${hash.toLowerCase().replace(/^0x/, '')}`
}

export function saveLocalApprovalMaterial(material: LocalApprovalMaterial) {
  window.localStorage.setItem(storageKey(material.hash), JSON.stringify(material))
  return localApprovalMaterialUri(material.hash)
}

export function getLocalApprovalMaterial(uri: string) {
  if (!uri.startsWith('local-demo://approval/')) return null
  const hash = `0x${uri.slice('local-demo://approval/'.length)}`.toLowerCase()
  const stored = window.localStorage.getItem(storageKey(hash))
  if (!stored) return null
  try {
    const material = JSON.parse(stored) as LocalApprovalMaterial
    return material.hash.toLowerCase() === hash ? material : null
  } catch {
    return null
  }
}

export function approvalMaterialHref(uri: string) {
  if (!uri) return ''
  if (uri.startsWith('local-demo://approval/')) return getLocalApprovalMaterial(uri)?.dataUrl ?? ''
  return uri
}

export async function approvalMaterialBlob(uri: string) {
  const href = approvalMaterialHref(uri)
  if (!href) throw new Error('The approval material is not available in this browser.')
  const response = await fetch(href, { cache: 'no-store' })
  if (!response.ok) throw new Error('Unable to load the approval material.')
  return response.blob()
}

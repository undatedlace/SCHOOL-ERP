import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/api';
import { MAX_FILES } from './types';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export interface PendingAttachment {
  key: string;
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  status: 'uploading' | 'done' | 'error';
  fileId?: string;
  error?: string;
}

export type PickedFile = Pick<PendingAttachment, 'uri' | 'name' | 'mimeType' | 'sizeBytes'>;

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/** The type of a file from its name, when the picker did not say. */
export function mimeFromName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? null;
}

/** A sentence saying why a file cannot be attached, or null when it can. */
export function attachmentProblem(
  file: { mimeType: string; sizeBytes: number | null },
  alreadyAttached: number,
): string | null {
  if (alreadyAttached >= MAX_FILES) return `You can attach up to ${MAX_FILES} files to a message.`;
  if (!(ALLOWED_MIME as readonly string[]).includes(file.mimeType)) {
    return 'Only photos (JPEG, PNG, WebP) and PDF files can be attached.';
  }
  if (file.sizeBytes !== null && file.sizeBytes > MAX_ATTACHMENT_BYTES) return 'That file is bigger than 10 MB.';
  return null;
}

let counter = 0;
export const newKey = () => `att-${Date.now()}-${counter++}`;

function fromImageAsset(asset: ImagePicker.ImagePickerAsset): PickedFile {
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  return {
    uri: asset.uri,
    name,
    mimeType: asset.mimeType ?? mimeFromName(name) ?? 'image/jpeg',
    sizeBytes: asset.fileSize ?? null,
  };
}

/** Opens the camera. Returns null when cancelled, or `{ error }` when the camera is not allowed. */
export async function takePhoto(): Promise<PickedFile | { error: string } | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { error: 'Allow the camera in Settings to take a photo.' };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets[0]) return null;
  return fromImageAsset(result.assets[0]);
}

/** Opens the photo library (up to `limit` photos). */
export async function choosePhotos(limit: number): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: limit > 1,
    selectionLimit: Math.max(1, limit),
  });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map(fromImageAsset);
}

/** Opens the file picker for a PDF. */
export async function choosePdf(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', sizeBytes: a.size ?? null };
}

/**
 * Uploads one file with the purpose `message-attachment` and returns its id.
 * TODO(coordinator): switch to features/files/upload.ts once agent F's version is merged.
 */
export async function uploadAttachment(file: PickedFile): Promise<string> {
  const form = new FormData();
  form.append('purpose', 'message-attachment');
  // React Native's FormData takes this shape for a file on disk.
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  const result = await api.post<{ id: string }>('/files', undefined, { form });
  return result.id;
}

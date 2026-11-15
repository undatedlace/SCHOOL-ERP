/**
 * Picking a photo or a PDF and uploading it to the API (`POST /files`). Shared by homework hand-in
 * and, later, by messages. The API judges the file by its bytes (JPEG, PNG, WebP and PDF only) and
 * answers with the file's id, which the feature then attaches to its own record.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/api';
import { extensionFor, fileNameFor } from './file-names';

export type FileSource = 'camera' | 'gallery' | 'document';

/** A file chosen on the phone, not uploaded yet. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

/** The API's answer to `POST /files`. */
export interface UploadedFile {
  id: string;
  purpose: string;
  mimeType: string;
  sizeBytes: number;
}

/** A reason the person can read, such as a refused permission. */
export class PickError extends Error {}

/** The multipart body for `POST /files`. The runtime adds the boundary; the purpose decides who may see the file. */
export function buildUploadForm(file: PickedFile, purpose: string): FormData {
  const form = new FormData();
  // React Native reads { uri, name, type } as a file part.
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  form.append('purpose', purpose);
  return form;
}

/** Sends a picked file. `purpose` is one of the API's file purposes (for example `homework-submission`). */
export function uploadFile(file: PickedFile, purpose: string): Promise<UploadedFile> {
  return api.post<UploadedFile>('/files', undefined, { form: buildUploadForm(file, purpose) });
}

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  // Below 1 the phone writes a JPEG, which the API accepts (it refuses HEIC).
  quality: 0.7,
  exif: false,
};

function fromImageAsset(asset: ImagePicker.ImagePickerAsset): PickedFile {
  const mimeType = asset.mimeType && extensionFor(asset.mimeType) ? asset.mimeType : 'image/jpeg';
  return { uri: asset.uri, name: fileNameFor(asset.fileName, mimeType), mimeType };
}

/**
 * Opens the camera, the photo library or the file picker. Returns the chosen files (an empty list
 * when the person cancels). Throws a `PickError` with a plain message when the phone refuses.
 */
export async function pickFiles(source: FileSource, limit: number): Promise<PickedFile[]> {
  if (limit < 1) return [];

  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new PickError('Allow the camera in your phone settings to take a photo.');
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync(IMAGE_OPTIONS);
    } catch {
      throw new PickError('The camera could not be opened on this phone.');
    }
    return result.canceled ? [] : result.assets.map(fromImageAsset);
  }

  if (source === 'gallery') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new PickError('Allow access to your photos in your phone settings to choose one.');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      ...IMAGE_OPTIONS,
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
    });
    return result.canceled ? [] : result.assets.slice(0, limit).map(fromImageAsset);
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple: limit > 1,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset) => ({
    uri: asset.uri,
    name: fileNameFor(asset.name, 'application/pdf'),
    mimeType: 'application/pdf',
  }));
}

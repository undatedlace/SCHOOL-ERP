import { useCallback, useRef, useState } from 'react';
import { errorMessage } from '@/api';
import { pickFiles, PickError, uploadFile, type FileSource, type PickedFile } from './upload';

export interface Attachment {
  key: string;
  name: string;
  uri: string;
  mimeType: string;
  status: 'uploading' | 'done' | 'error';
  /** The file's id once the API has it. */
  fileId?: string;
  error?: string;
}

/**
 * The files a person is attaching to something (a hand-in, a message). Each file uploads as soon
 * as it is chosen, so a problem shows at once; the screen then sends `fileIds` with its own form.
 */
export function useAttachments(purpose: string, max: number) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const counter = useRef(0);
  const itemsRef = useRef<Attachment[]>([]);
  itemsRef.current = items;

  const patch = useCallback((key: string, change: Partial<Attachment>) => {
    setItems((all) => all.map((a) => (a.key === key ? { ...a, ...change } : a)));
  }, []);

  const send = useCallback(
    async (key: string, file: PickedFile) => {
      try {
        const uploaded = await uploadFile(file, purpose);
        patch(key, { status: 'done', fileId: uploaded.id, error: undefined });
      } catch (error) {
        patch(key, { status: 'error', error: errorMessage(error) });
      }
    },
    [patch, purpose],
  );

  const add = useCallback(
    async (source: FileSource) => {
      setNotice(null);
      const room = max - itemsRef.current.length;
      if (room < 1) {
        setNotice(`You can attach up to ${max} files.`);
        return;
      }
      let picked: PickedFile[];
      try {
        picked = await pickFiles(source, room);
      } catch (error) {
        setNotice(error instanceof PickError ? error.message : errorMessage(error));
        return;
      }
      const fresh = picked.map((file) => ({ key: `f${++counter.current}`, file }));
      setItems((all) => [
        ...all,
        ...fresh.map(({ key, file }) => ({
          key,
          name: file.name,
          uri: file.uri,
          mimeType: file.mimeType,
          status: 'uploading' as const,
        })),
      ]);
      await Promise.all(fresh.map(({ key, file }) => send(key, file)));
    },
    [max, send],
  );

  const retry = useCallback(
    (key: string) => {
      const found = itemsRef.current.find((a) => a.key === key);
      if (!found) return;
      patch(key, { status: 'uploading', error: undefined });
      void send(key, { uri: found.uri, name: found.name, mimeType: found.mimeType });
    },
    [patch, send],
  );

  const remove = useCallback((key: string) => {
    setItems((all) => all.filter((a) => a.key !== key));
  }, []);

  const reset = useCallback(() => {
    setItems([]);
    setNotice(null);
  }, []);

  return {
    items,
    notice,
    add,
    retry,
    remove,
    reset,
    /** Ids of the files the API has stored. */
    fileIds: items.flatMap((a) => (a.status === 'done' && a.fileId ? [a.fileId] : [])),
    uploading: items.some((a) => a.status === 'uploading'),
    hasFailed: items.some((a) => a.status === 'error'),
    full: items.length >= max,
  };
}

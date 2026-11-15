import { useCallback, useRef, useState } from 'react';
import { errorMessage } from '@/api/errors';
import {
  attachmentProblem,
  choosePdf,
  choosePhotos,
  newKey,
  takePhoto,
  uploadAttachment,
  type PendingAttachment,
  type PickedFile,
} from './attachments';
import { MAX_FILES } from './types';

export type AttachSource = 'camera' | 'photos' | 'pdf';

/**
 * The files being attached to a message. Each file is uploaded as soon as it is picked, so that
 * "Send" only has to pass the ids. `notice` is the reason the last pick was refused.
 */
export function useAttachments() {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const countRef = useRef(0);

  const patch = useCallback((key: string, change: Partial<PendingAttachment>) => {
    setItems((list) => list.map((a) => (a.key === key ? { ...a, ...change } : a)));
  }, []);

  const add = useCallback(
    async (files: PickedFile[]) => {
      setNotice(null);
      const accepted: PendingAttachment[] = [];
      for (const file of files) {
        const problem = attachmentProblem(file, countRef.current + accepted.length);
        if (problem) {
          setNotice(problem);
          break;
        }
        accepted.push({ ...file, key: newKey(), status: 'uploading' });
      }
      if (accepted.length === 0) return;
      countRef.current += accepted.length;
      setItems((list) => [...list, ...accepted]);
      await Promise.all(
        accepted.map(async (a) => {
          try {
            const fileId = await uploadAttachment(a);
            patch(a.key, { status: 'done', fileId });
          } catch (e) {
            patch(a.key, { status: 'error', error: errorMessage(e) });
          }
        }),
      );
    },
    [patch],
  );

  const pick = useCallback(
    async (source: AttachSource) => {
      setNotice(null);
      const room = MAX_FILES - countRef.current;
      if (room <= 0) {
        setNotice(`You can attach up to ${MAX_FILES} files to a message.`);
        return;
      }
      try {
        if (source === 'camera') {
          const photo = await takePhoto();
          if (photo && 'error' in photo) setNotice(photo.error);
          else if (photo) await add([photo]);
        } else if (source === 'photos') {
          await add(await choosePhotos(room));
        } else {
          const pdf = await choosePdf();
          if (pdf) await add([pdf]);
        }
      } catch (e) {
        setNotice(errorMessage(e));
      }
    },
    [add],
  );

  const remove = useCallback((key: string) => {
    setItems((list) => {
      const next = list.filter((a) => a.key !== key);
      countRef.current = next.length;
      return next;
    });
    setNotice(null);
  }, []);

  const reset = useCallback(() => {
    countRef.current = 0;
    setItems([]);
    setNotice(null);
  }, []);

  const uploading = items.some((a) => a.status === 'uploading');
  const failed = items.some((a) => a.status === 'error');
  const fileIds = items.flatMap((a) => (a.status === 'done' && a.fileId ? [a.fileId] : []));

  return { items, notice, pick, remove, reset, uploading, failed, fileIds };
}

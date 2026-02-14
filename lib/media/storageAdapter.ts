import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";

import { getFirebaseStorage } from "../firebase";

export interface StorageAdapter {
  upload(
    path: string,
    file: Blob,
    onProgress?: (progress: number) => void
  ): Promise<string>;
}

export class FirebaseStorageAdapter implements StorageAdapter {
  async upload(
    path: string,
    file: Blob,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const storage = getFirebaseStorage();
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) onProgress(progress);
        },
        (error) => {
          reject(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  }
}

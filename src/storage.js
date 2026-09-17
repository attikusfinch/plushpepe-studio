const open = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('plushpepe-studio', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('projects');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function restoreProject(key = 'current') {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const request = transaction.objectStore('projects').get(key);
    request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
export async function saveProject(project, key = 'current') {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    transaction.objectStore('projects').put(project, key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export const restoreFacePresets = () => restoreProject('face-presets');
export const saveFacePresets = presets => saveProject(presets, 'face-presets');

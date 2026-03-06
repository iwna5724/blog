/**
 * DraftDB - IndexedDB 기반 임시저장 관리
 * editor.html과 admin/index.html에서 공유 사용
 *
 * Object stores:
 *   drafts     - keyPath: 'id', index: 'filename'  (blog_drafts 대체)
 *   images     - keyPath: 'filename'               (blog_draft_images_* 대체)
 *   auto_draft - keyPath: 'id'                     (blog_draft 대체)
 */
const DraftDB = (() => {
  const DB_NAME = 'blog-drafts-db';
  const DB_VERSION = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('drafts')) {
          const store = db.createObjectStore('drafts', { keyPath: 'id' });
          store.createIndex('filename', 'filename', { unique: false });
        }
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'filename' });
        }
        if (!db.objectStoreNames.contains('auto_draft')) {
          db.createObjectStore('auto_draft', { keyPath: 'id' });
        }
      };

      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function req(storeName, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const r = fn(store);
      tx.oncomplete = () => resolve(r ? r.result : undefined);
      tx.onerror = () => reject(tx.error);
    }));
  }

  return {
    // --- Drafts ---
    getAllDrafts() {
      return open().then(db => new Promise((resolve, reject) => {
        const r = db.transaction('drafts', 'readonly').objectStore('drafts').getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }));
    },

    getDraft(id) {
      return open().then(db => new Promise((resolve, reject) => {
        const r = db.transaction('drafts', 'readonly').objectStore('drafts').get(id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      }));
    },

    getDraftByFilename(filename) {
      return open().then(db => new Promise((resolve, reject) => {
        const r = db.transaction('drafts', 'readonly')
          .objectStore('drafts').index('filename').get(filename);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      }));
    },

    putDraft(draft) {
      return req('drafts', 'readwrite', store => store.put(draft));
    },

    deleteDraft(id) {
      return req('drafts', 'readwrite', store => store.delete(id));
    },

    // --- Images (draft filename을 key로 이미지 배열 저장) ---
    getImages(filename) {
      return open().then(db => new Promise((resolve, reject) => {
        const r = db.transaction('images', 'readonly').objectStore('images').get(filename);
        r.onsuccess = () => resolve((r.result && r.result.images) || []);
        r.onerror = () => reject(r.error);
      }));
    },

    putImages(filename, images) {
      return req('images', 'readwrite', store => store.put({ filename, images }));
    },

    deleteImages(filename) {
      return req('images', 'readwrite', store => store.delete(filename));
    },

    // --- Auto draft (자동저장, key='auto') ---
    getAutoDraft() {
      return open().then(db => new Promise((resolve, reject) => {
        const r = db.transaction('auto_draft', 'readonly').objectStore('auto_draft').get('auto');
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      }));
    },

    putAutoDraft(data) {
      return req('auto_draft', 'readwrite', store => store.put({ id: 'auto', ...data }));
    },

    clearAutoDraft() {
      return req('auto_draft', 'readwrite', store => store.delete('auto'));
    },
  };
})();

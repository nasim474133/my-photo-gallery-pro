// Android app (Capacitor) e extra kaj. Browser/GitHub Pages e ei file kichu kore na.
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;

  function call(plugin, method, opts) {
    var P = C.Plugins && C.Plugins[plugin];
    if (P && P[method]) return P[method](opts || {});
    return C.nativePromise(plugin, method, opts || {});
  }

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }

  // 3MB chunks (multiple of 3 bytes) so big videos do not choke the bridge
  var CHUNK = 3 * 1024 * 1024;

  async function writeToCache(file, path) {
    for (var off = 0, first = true; off < file.size || first; off += CHUNK) {
      var data = await toBase64(file.slice(off, off + CHUNK));
      var args = { path: path, data: data, directory: 'CACHE' };
      if (first) { args.recursive = true; await call('Filesystem', 'writeFile', args); first = false; }
      else { await call('Filesystem', 'appendFile', args); }
    }
    var u = await call('Filesystem', 'getUri', { path: path, directory: 'CACHE' });
    return u.uri;
  }

  // ---- Share OUT (Facebook Share, Share Selected) ----
  navigator.canShare = function () { return true; };
  navigator.share = async function (data) {
    data = data || {};
    var files = data.files || [];
    var uris = [];
    var stamp = Date.now();
    for (var i = 0; i < files.length; i++) {
      var safe = (stamp + '_' + i + '_' + (files[i].name || 'file')).replace(/[^\w.\-]+/g, '_');
      uris.push(await writeToCache(files[i], 'share/' + safe));
    }
    try {
      await call('Share', 'share', { title: data.title || '', text: data.text || '', files: uris, dialogTitle: 'Share' });
    } catch (e) {
      if (/cancel/i.test(String((e && e.message) || e))) {
        var err = new Error('Share canceled');
        err.name = 'AbortError';
        throw err;
      }
      throw e;
    }
  };

  // ---- Share IN (ChatGPT / Gemini / Gallery theke "Share" -> Photo Gallery) ----
  window.native = {
    isNative: true,
    takeIncoming: async function () {
      var r = await call('ShareIn', 'takeIncoming', {});
      return (r && r.items) || [];
    },
    readFile: async function (uri, type) {
      var res = await fetch(C.convertFileSrc(uri));
      if (!res.ok) throw new Error('file read failed');
      var b = await res.blob();
      return type ? new Blob([b], { type: type }) : b;
    },
    deleteFile: function (uri) {
      return call('Filesystem', 'deleteFile', { path: uri }).catch(function () {});
    }
  };
})();

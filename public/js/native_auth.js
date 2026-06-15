/* js/native_auth.js */
window.__nativeAuth = {
  _pendingCallbacks: {},

  _onSignInResult(callbackId, encodedToken, encodedPhoto, encodedName) {
    try {
      const idToken = atob(encodedToken);
      const photoURL = encodedPhoto ? atob(encodedPhoto) : '';
      const displayName = encodedName ? atob(encodedName) : '';
      const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
      auth.signInWithCredential(credential).then(result => {
        const user = result.user;
        const updates = {};
        if (photoURL && !user.photoURL) updates.photoURL = photoURL;
        if (displayName && !user.displayName) updates.displayName = displayName;
        if (Object.keys(updates).length > 0) {
          return user.updateProfile(updates).then(() => {
            console.log('[NativeAuth] Sign-in success with profile:', user.email, photoURL);
            if (window.__nativeAuth._pendingCallbacks[callbackId]) {
              window.__nativeAuth._pendingCallbacks[callbackId](null, result);
              delete window.__nativeAuth._pendingCallbacks[callbackId];
            }
          });
        }
        console.log('[NativeAuth] Sign-in success:', user.email);
        if (window.__nativeAuth._pendingCallbacks[callbackId]) {
          window.__nativeAuth._pendingCallbacks[callbackId](null, result);
          delete window.__nativeAuth._pendingCallbacks[callbackId];
        }
      }).catch(e => {
        console.error('[NativeAuth] Firebase signInWithCredential failed:', e);
        if (window.__nativeAuth._pendingCallbacks[callbackId]) {
          window.__nativeAuth._pendingCallbacks[callbackId](e, null);
          delete window.__nativeAuth._pendingCallbacks[callbackId];
        }
      });
    } catch(e) {
      console.error('[NativeAuth] _onSignInResult error:', e);
    }
  },

  _onSignInError(callbackId, errorMsg) {
    console.error('[NativeAuth] Sign-in error:', errorMsg);
    if (window.__nativeAuth._pendingCallbacks[callbackId]) {
      window.__nativeAuth._pendingCallbacks[callbackId](new Error(errorMsg), null);
      delete window.__nativeAuth._pendingCallbacks[callbackId];
    }
  },

  _onSignOut() {
    console.log('[NativeAuth] Sign-out complete');
  },

  signIn() {
    return new Promise((resolve, reject) => {
      const cbId = 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      window.__nativeAuth._pendingCallbacks[cbId] = (err, user) => {
        if (err) reject(err);
        else resolve(user);
      };
      try {
        window.NativeAuth.signIn(cbId);
      } catch(e) {
        delete window.__nativeAuth._pendingCallbacks[cbId];
        reject(e);
      }
    });
  },

  signOut() {
    try {
      window.NativeAuth.signOut();
    } catch(e) {
      console.warn('[NativeAuth] signOut failed:', e);
    }
  }
};

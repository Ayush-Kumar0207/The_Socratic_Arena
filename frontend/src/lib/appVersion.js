export const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';
export const APP_BUILD_TIME = import.meta.env.VITE_APP_BUILD_TIME || '';

export const APP_VERSION_STORAGE_KEY = 'socratic_arena_app_version';
export const APP_DISMISSED_UPGRADE_KEY = 'socratic_arena_dismissed_upgrade_version';
export const APP_PENDING_UPGRADE_KEY = 'socratic_arena_pending_upgrade_version';

export const getStoredAppVersion = () => {
  try {
    return localStorage.getItem(APP_VERSION_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredAppVersion = (version = APP_VERSION) => {
  try {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, version);
  } catch {
    // Ignore storage failures in private/incognito contexts.
  }
};

export const getDismissedUpgradeVersion = () => {
  try {
    return localStorage.getItem(APP_DISMISSED_UPGRADE_KEY);
  } catch {
    return null;
  }
};

export const setDismissedUpgradeVersion = (version) => {
  if (!version) return;
  try {
    localStorage.setItem(APP_DISMISSED_UPGRADE_KEY, version);
  } catch {
    // Ignore storage failures in private/incognito contexts.
  }
};

export const setPendingUpgradeVersion = (version) => {
  try {
    if (version) {
      localStorage.setItem(APP_PENDING_UPGRADE_KEY, version);
    } else {
      localStorage.removeItem(APP_PENDING_UPGRADE_KEY);
    }
  } catch {
    // Ignore storage failures in private/incognito contexts.
  }
};

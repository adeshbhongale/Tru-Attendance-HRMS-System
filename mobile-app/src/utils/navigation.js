import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

let pendingNav = null;

export function navigateGlobal(name, params) {
  if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name !== 'Login') {
    pendingNav = null;
    navigationRef.navigate(name, params);
    return;
  }
  pendingNav = { name, params };
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name !== 'Login') {
      clearInterval(timer);
      if (pendingNav) {
        const target = pendingNav;
        pendingNav = null;
        navigationRef.navigate(target.name, target.params);
      }
    } else if (attempts >= 30) {
      clearInterval(timer);
    }
  }, 300);
}

export function resetGlobal(name) {
  if (navigationRef.isReady()) {
    navigationRef.reset({
      index: 0,
      routes: [{ name }],
    });
  } else {
    setTimeout(() => {
      if (navigationRef.isReady()) {
        navigationRef.reset({
          index: 0,
          routes: [{ name }],
        });
      }
    }, 250);
  }
}

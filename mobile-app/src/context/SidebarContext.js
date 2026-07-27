import React, { createContext, useContext, useState } from 'react';

const SidebarContext = createContext({
  sidebarVisible: false,
  openSidebar: () => {},
  closeSidebar: () => {},
  toggleSidebar: () => {},
});

export const SidebarProvider = ({ children }) => {
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const openSidebar = () => setSidebarVisible(true);
  const closeSidebar = () => setSidebarVisible(false);
  const toggleSidebar = () => setSidebarVisible(prev => !prev);

  return (
    <SidebarContext.Provider
      value={{
        sidebarVisible,
        openSidebar,
        closeSidebar,
        toggleSidebar,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => useContext(SidebarContext);

export default SidebarContext;

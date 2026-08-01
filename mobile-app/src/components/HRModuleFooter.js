import React from 'react';
import GlobalAppFooter from './GlobalAppFooter';

/**
 * HRModuleFooter - Delegated Wrapper around GlobalAppFooter for HR Module
 */
const HRModuleFooter = ({ navigation, currentScreen }) => {
  return (
    <GlobalAppFooter
      navigation={navigation}
      currentScreen={currentScreen}
      module="hr"
    />
  );
};

export default HRModuleFooter;
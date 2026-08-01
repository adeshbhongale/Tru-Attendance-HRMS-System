import React from 'react';
import GlobalAppFooter from '../../../components/GlobalAppFooter';

/**
 * MaterialModuleFooter - Delegated Wrapper around GlobalAppFooter for Material Module
 */
const MaterialModuleFooter = ({ navigation, currentScreen }) => {
  return (
    <GlobalAppFooter
      navigation={navigation}
      currentScreen={currentScreen}
      module="material"
    />
  );
};

export default MaterialModuleFooter;

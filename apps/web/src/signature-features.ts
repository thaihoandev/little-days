let enabled = false;
export const configureSignatureFeatures = (value: boolean) => {
  enabled = value;
};
export const signatureFeaturesAvailable = () => enabled;

export const defaultMockDeviceInfo = {
  browser: "Chrome",
  os: "Linux",
  ip: "127.0.0.1",
};

export const createMockGetDeviceInfoModule = (
  deviceInfo = defaultMockDeviceInfo,
) => ({
  default: () => deviceInfo,
});

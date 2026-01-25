const getObjectKeyFromUrl = (url: string) => {
  const pathname = new URL(url).pathname;
  return pathname.startsWith("/") ? pathname.slice(1) : pathname;
};

export default getObjectKeyFromUrl;
